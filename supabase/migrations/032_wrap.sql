-- ─────────────────────────────────────────────────────────────────────────────
-- 032: POST-EVENT WRAP
-- After an event ends, attendees can: rate the people they met (private
-- thumbs up/down), leave private notes, pour up to 4 photos into a shared
-- pool with likes + one comment each, vote superlatives, give the host
-- private feedback, and request an encore. A pg_cron job notifies attendees
-- when their wrap is ready.
--
-- Run this whole file in the Supabase SQL editor. If the editor complains
-- about "unsafe use of new value" on the enum, run the ALTER TYPE block at
-- the top by itself first, then the rest of the file.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── NEW NOTIFICATION TYPES ──────────────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'wrap_ready';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'note_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'photo_liked';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'photo_commented';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'encore_requested';

-- ── HELPERS ─────────────────────────────────────────────────────────────────
-- When an event is considered over. ends_at is nullable; fall back to
-- starts_at + 4h (the chat purge in 030 uses the same COALESCE idea).
CREATE OR REPLACE FUNCTION wrap_end_at(p_event_id UUID)
RETURNS TIMESTAMPTZ AS $$
  SELECT COALESCE(e.ends_at, e.starts_at + INTERVAL '4 hours')
  FROM events e WHERE e.id = p_event_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Contribution window: from the moment the event ends until 7 days after.
CREATE OR REPLACE FUNCTION wrap_window_open(p_event_id UUID)
RETURNS BOOLEAN AS $$
  SELECT wrap_end_at(p_event_id) <= NOW()
     AND NOW() < wrap_end_at(p_event_id) + INTERVAL '7 days';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Approved participant or host — the canonical event-membership check.
CREATE OR REPLACE FUNCTION is_event_attendee(p_event_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM event_participants ep
    WHERE ep.event_id = p_event_id
      AND ep.user_id = p_user_id
      AND ep.status = 'approved'
    UNION
    SELECT 1 FROM events e
    WHERE e.id = p_event_id AND e.host_id = p_user_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── PEOPLE RATINGS ──────────────────────────────────────────────────────────
-- Private: the ratee can never read who rated them or how. A thumbs-up also
-- lands in the existing `thumbs` table (single source of profiles.thumbs_count,
-- migration 013). Downvotes have zero side effects.
CREATE TABLE IF NOT EXISTS event_ratings (
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rater_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ratee_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating     TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, rater_id, ratee_id),
  CHECK (rater_id <> ratee_id)
);

ALTER TABLE event_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_ratings_select" ON event_ratings;
CREATE POLICY "event_ratings_select" ON event_ratings
  FOR SELECT TO authenticated USING (rater_id = auth.uid());

DROP POLICY IF EXISTS "event_ratings_insert" ON event_ratings;
CREATE POLICY "event_ratings_insert" ON event_ratings
  FOR INSERT TO authenticated WITH CHECK (
    rater_id = auth.uid()
    AND is_event_attendee(event_id, auth.uid())
    AND is_event_attendee(event_id, ratee_id)
    AND wrap_window_open(event_id)
  );

-- Delete enables undo in the rating deck.
DROP POLICY IF EXISTS "event_ratings_delete" ON event_ratings;
CREATE POLICY "event_ratings_delete" ON event_ratings
  FOR DELETE TO authenticated USING (rater_id = auth.uid());

CREATE OR REPLACE FUNCTION on_event_rating()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rating = 'up' THEN
    INSERT INTO thumbs (giver_id, receiver_id)
    VALUES (NEW.rater_id, NEW.ratee_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_event_rating ON event_ratings;
CREATE TRIGGER on_event_rating
  AFTER INSERT ON event_ratings
  FOR EACH ROW EXECUTE FUNCTION on_event_rating();

-- ── PRIVATE NOTES ───────────────────────────────────────────────────────────
-- Sealed note delivered to a co-attendee's inbox. Non-replyable; DMs stay
-- friends-only (008), which is why notes are their own table.
CREATE TABLE IF NOT EXISTS wrap_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content      TEXT NOT NULL CHECK (char_length(content) <= 500),
  photo_url    TEXT,
  opened_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, sender_id, recipient_id),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS wrap_notes_recipient_idx ON wrap_notes (recipient_id);

ALTER TABLE wrap_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wrap_notes_select" ON wrap_notes;
CREATE POLICY "wrap_notes_select" ON wrap_notes
  FOR SELECT TO authenticated
  USING (auth.uid() IN (sender_id, recipient_id));

DROP POLICY IF EXISTS "wrap_notes_insert" ON wrap_notes;
CREATE POLICY "wrap_notes_insert" ON wrap_notes
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND is_event_attendee(event_id, sender_id)
    AND is_event_attendee(event_id, recipient_id)
    AND wrap_window_open(event_id)
  );

-- Recipient marks the note opened.
DROP POLICY IF EXISTS "wrap_notes_update" ON wrap_notes;
CREATE POLICY "wrap_notes_update" ON wrap_notes
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE OR REPLACE FUNCTION on_wrap_note()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
  VALUES (NEW.recipient_id, NEW.sender_id, 'note_received', NEW.event_id,
          jsonb_build_object('eventTitle',
            (SELECT title FROM events WHERE id = NEW.event_id)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_wrap_note ON wrap_notes;
CREATE TRIGGER on_wrap_note
  AFTER INSERT ON wrap_notes
  FOR EACH ROW EXECUTE FUNCTION on_wrap_note();

-- ── PHOTO POOL ──────────────────────────────────────────────────────────────
-- Up to 4 photos per attendee per event. Attendee-only via RLS; the public
-- top-6 is exposed only through the SECURITY DEFINER RPCs in 033.
CREATE TABLE IF NOT EXISTS event_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  caption     TEXT CHECK (caption IS NULL OR char_length(caption) <= 300),
  mentions    UUID[] NOT NULL DEFAULT '{}',
  like_count  INT NOT NULL DEFAULT 0,
  hidden      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_photos_event_idx
  ON event_photos (event_id, hidden, like_count DESC);

ALTER TABLE event_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_photos_select" ON event_photos;
CREATE POLICY "event_photos_select" ON event_photos
  FOR SELECT TO authenticated USING (
    is_event_attendee(event_id, auth.uid())
    AND (hidden = FALSE OR uploader_id = auth.uid())
  );

DROP POLICY IF EXISTS "event_photos_insert" ON event_photos;
CREATE POLICY "event_photos_insert" ON event_photos
  FOR INSERT TO authenticated WITH CHECK (
    uploader_id = auth.uid()
    AND is_event_attendee(event_id, auth.uid())
    AND wrap_window_open(event_id)
  );

DROP POLICY IF EXISTS "event_photos_delete" ON event_photos;
CREATE POLICY "event_photos_delete" ON event_photos
  FOR DELETE TO authenticated USING (uploader_id = auth.uid());

-- Server-side cap: 4 photos per uploader per event.
CREATE OR REPLACE FUNCTION enforce_photo_cap()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM event_photos
      WHERE event_id = NEW.event_id AND uploader_id = NEW.uploader_id) >= 4 THEN
    RAISE EXCEPTION 'photo limit reached (4 per event)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_photo_cap ON event_photos;
CREATE TRIGGER enforce_photo_cap
  BEFORE INSERT ON event_photos
  FOR EACH ROW EXECUTE FUNCTION enforce_photo_cap();

-- ── PHOTO LIKES (one per user per photo) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS wrap_photo_likes (
  photo_id   UUID NOT NULL REFERENCES event_photos(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (photo_id, user_id)
);

ALTER TABLE wrap_photo_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wrap_photo_likes_select" ON wrap_photo_likes;
CREATE POLICY "wrap_photo_likes_select" ON wrap_photo_likes
  FOR SELECT TO authenticated USING (
    photo_id IN (
      SELECT p.id FROM event_photos p
      WHERE is_event_attendee(p.event_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "wrap_photo_likes_insert" ON wrap_photo_likes;
CREATE POLICY "wrap_photo_likes_insert" ON wrap_photo_likes
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND photo_id IN (
      SELECT p.id FROM event_photos p
      WHERE is_event_attendee(p.event_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "wrap_photo_likes_delete" ON wrap_photo_likes;
CREATE POLICY "wrap_photo_likes_delete" ON wrap_photo_likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION on_wrap_photo_like()
RETURNS TRIGGER AS $$
DECLARE
  photo RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE event_photos SET like_count = like_count + 1
    WHERE id = NEW.photo_id
    RETURNING event_id, uploader_id INTO photo;

    IF photo.uploader_id <> NEW.user_id THEN
      INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
      VALUES (photo.uploader_id, NEW.user_id, 'photo_liked', photo.event_id,
              jsonb_build_object('eventTitle',
                (SELECT title FROM events WHERE id = photo.event_id)));
    END IF;
    RETURN NEW;
  ELSE
    UPDATE event_photos SET like_count = GREATEST(like_count - 1, 0)
    WHERE id = OLD.photo_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_wrap_photo_like ON wrap_photo_likes;
CREATE TRIGGER on_wrap_photo_like
  AFTER INSERT OR DELETE ON wrap_photo_likes
  FOR EACH ROW EXECUTE FUNCTION on_wrap_photo_like();

-- ── PHOTO COMMENTS (one per user per photo — composite PK enforces it) ──────
CREATE TABLE IF NOT EXISTS wrap_photo_comments (
  photo_id   UUID NOT NULL REFERENCES event_photos(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (char_length(content) <= 300),
  mentions   UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (photo_id, user_id)
);

ALTER TABLE wrap_photo_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wrap_photo_comments_select" ON wrap_photo_comments;
CREATE POLICY "wrap_photo_comments_select" ON wrap_photo_comments
  FOR SELECT TO authenticated USING (
    photo_id IN (
      SELECT p.id FROM event_photos p
      WHERE is_event_attendee(p.event_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "wrap_photo_comments_insert" ON wrap_photo_comments;
CREATE POLICY "wrap_photo_comments_insert" ON wrap_photo_comments
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND photo_id IN (
      SELECT p.id FROM event_photos p
      WHERE is_event_attendee(p.event_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "wrap_photo_comments_delete" ON wrap_photo_comments;
CREATE POLICY "wrap_photo_comments_delete" ON wrap_photo_comments
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION on_wrap_photo_comment()
RETURNS TRIGGER AS $$
DECLARE
  photo RECORD;
BEGIN
  SELECT event_id, uploader_id INTO photo
  FROM event_photos WHERE id = NEW.photo_id;

  IF photo.uploader_id <> NEW.user_id THEN
    INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
    VALUES (photo.uploader_id, NEW.user_id, 'photo_commented', photo.event_id,
            jsonb_build_object('eventTitle',
              (SELECT title FROM events WHERE id = photo.event_id)));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_wrap_photo_comment ON wrap_photo_comments;
CREATE TRIGGER on_wrap_photo_comment
  AFTER INSERT ON wrap_photo_comments
  FOR EACH ROW EXECUTE FUNCTION on_wrap_photo_comment();

-- ── PHOTO REPORTS ───────────────────────────────────────────────────────────
-- 'remove_me' ("I don't want my photo included") hides the photo for everyone
-- immediately; other reasons keep an audit trail for moderation.
CREATE TABLE IF NOT EXISTS wrap_photo_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id    UUID NOT NULL REFERENCES event_photos(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL CHECK (reason IN
                ('inappropriate', 'not_this_event', 'spam', 'remove_me', 'other')),
  details     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wrap_photo_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wrap_photo_reports_insert" ON wrap_photo_reports;
CREATE POLICY "wrap_photo_reports_insert" ON wrap_photo_reports
  FOR INSERT TO authenticated WITH CHECK (
    reporter_id = auth.uid()
    AND photo_id IN (
      SELECT p.id FROM event_photos p
      WHERE is_event_attendee(p.event_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "wrap_photo_reports_select" ON wrap_photo_reports;
CREATE POLICY "wrap_photo_reports_select" ON wrap_photo_reports
  FOR SELECT TO authenticated USING (reporter_id = auth.uid());

CREATE OR REPLACE FUNCTION on_wrap_photo_report()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reason = 'remove_me' THEN
    UPDATE event_photos SET hidden = TRUE WHERE id = NEW.photo_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_wrap_photo_report ON wrap_photo_reports;
CREATE TRIGGER on_wrap_photo_report
  AFTER INSERT ON wrap_photo_reports
  FOR EACH ROW EXECUTE FUNCTION on_wrap_photo_report();

-- ── SUPERLATIVES ────────────────────────────────────────────────────────────
-- Anonymous: voters see only their own rows; winners come from the RPC in 033
-- once a category has 3+ votes.
CREATE TABLE IF NOT EXISTS superlative_votes (
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category   TEXT NOT NULL CHECK (category IN
               ('mvp', 'first_to_arrive', 'next_host', 'best_vibes')),
  voter_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  votee_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, category, voter_id),
  CHECK (voter_id <> votee_id)
);

ALTER TABLE superlative_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superlative_votes_select" ON superlative_votes;
CREATE POLICY "superlative_votes_select" ON superlative_votes
  FOR SELECT TO authenticated USING (voter_id = auth.uid());

DROP POLICY IF EXISTS "superlative_votes_insert" ON superlative_votes;
CREATE POLICY "superlative_votes_insert" ON superlative_votes
  FOR INSERT TO authenticated WITH CHECK (
    voter_id = auth.uid()
    AND is_event_attendee(event_id, auth.uid())
    AND is_event_attendee(event_id, votee_id)
    AND wrap_window_open(event_id)
  );

-- Change your vote (upsert from the client).
DROP POLICY IF EXISTS "superlative_votes_update" ON superlative_votes;
CREATE POLICY "superlative_votes_update" ON superlative_votes
  FOR UPDATE TO authenticated
  USING (voter_id = auth.uid())
  WITH CHECK (
    voter_id = auth.uid()
    AND is_event_attendee(event_id, votee_id)
    AND wrap_window_open(event_id)
  );

-- ── HOST FEEDBACK ───────────────────────────────────────────────────────────
-- Private thumbs + optional note; the host only ever sees the anonymous
-- aggregate via get_event_feedback (033).
CREATE TABLE IF NOT EXISTS event_feedback (
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating     TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  note       TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE event_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_feedback_select" ON event_feedback;
CREATE POLICY "event_feedback_select" ON event_feedback
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "event_feedback_insert" ON event_feedback;
CREATE POLICY "event_feedback_insert" ON event_feedback
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND is_event_attendee(event_id, auth.uid())
    AND wrap_window_open(event_id)
    AND user_id <> (SELECT host_id FROM events WHERE id = event_id)
  );

DROP POLICY IF EXISTS "event_feedback_update" ON event_feedback;
CREATE POLICY "event_feedback_update" ON event_feedback
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND wrap_window_open(event_id));

-- ── ENCORE REQUESTS ("run it back") ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS encore_requests (
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE encore_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "encore_requests_select" ON encore_requests;
CREATE POLICY "encore_requests_select" ON encore_requests
  FOR SELECT TO authenticated USING (is_event_attendee(event_id, auth.uid()));

DROP POLICY IF EXISTS "encore_requests_insert" ON encore_requests;
CREATE POLICY "encore_requests_insert" ON encore_requests
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND is_event_attendee(event_id, auth.uid())
    AND wrap_end_at(event_id) <= NOW()
  );

DROP POLICY IF EXISTS "encore_requests_delete" ON encore_requests;
CREATE POLICY "encore_requests_delete" ON encore_requests
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Notify the host on the first request only (payload carries the count; the
-- host panel shows the live number).
CREATE OR REPLACE FUNCTION on_encore_request()
RETURNS TRIGGER AS $$
DECLARE
  ev RECORD;
BEGIN
  SELECT host_id, title INTO ev FROM events WHERE id = NEW.event_id;
  IF (SELECT COUNT(*) FROM encore_requests WHERE event_id = NEW.event_id) = 1
     AND ev.host_id <> NEW.user_id THEN
    INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
    VALUES (ev.host_id, NEW.user_id, 'encore_requested', NEW.event_id,
            jsonb_build_object('eventTitle', ev.title));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_encore_request ON encore_requests;
CREATE TRIGGER on_encore_request
  AFTER INSERT ON encore_requests
  FOR EACH ROW EXECUTE FUNCTION on_encore_request();

-- ── WRAP VIEWS (checklist auto-emphasis, server-side) ───────────────────────
CREATE TABLE IF NOT EXISTS wrap_views (
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  view_count     INT NOT NULL DEFAULT 1,
  last_viewed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE wrap_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wrap_views_own" ON wrap_views;
CREATE POLICY "wrap_views_own" ON wrap_views
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION bump_wrap_view(p_event_id UUID)
RETURNS INT AS $$
DECLARE
  new_count INT;
BEGIN
  INSERT INTO wrap_views (event_id, user_id)
  VALUES (p_event_id, auth.uid())
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET view_count = wrap_views.view_count + 1, last_viewed_at = NOW()
  RETURNING view_count INTO new_count;
  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION bump_wrap_view(UUID) TO authenticated;

-- ── WRAP READY NOTIFICATIONS (pg_cron, 023 pattern) ─────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS wrap_ready_notified BOOLEAN DEFAULT FALSE;

-- ~30 min after an event ends, tell everyone who was there (2+ attendees only;
-- a wrap for a party of one is no party).
CREATE OR REPLACE FUNCTION notify_wraps_ready()
RETURNS void AS $$
DECLARE
  due_ids UUID[];
BEGIN
  SELECT array_agg(e.id) INTO due_ids
  FROM events e
  WHERE e.wrap_ready_notified = FALSE
    AND wrap_end_at(e.id) + INTERVAL '30 minutes' <= NOW()
    AND wrap_end_at(e.id) > NOW() - INTERVAL '1 day'
    AND (SELECT COUNT(*) FROM event_participants ep
         WHERE ep.event_id = e.id AND ep.status = 'approved') >= 2;

  IF due_ids IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
  SELECT DISTINCT r.uid, NULL, 'wrap_ready', ev.id,
         jsonb_build_object('eventTitle', ev.title)
  FROM events ev
  JOIN LATERAL (
    SELECT ep.user_id AS uid
      FROM event_participants ep
      WHERE ep.event_id = ev.id AND ep.status = 'approved'
    UNION
    SELECT ev.host_id
  ) r ON TRUE
  WHERE ev.id = ANY(due_ids);

  UPDATE events SET wrap_ready_notified = TRUE WHERE id = ANY(due_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('wrap-ready');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'wrap-ready',
  '*/15 * * * *',
  $$SELECT notify_wraps_ready()$$
);
