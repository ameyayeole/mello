-- ─────────────────────────────────────────────────────────────────────────────
-- POLLS. A poll is a type='poll' post plus one polls row (closes_at), 2-4
-- poll_options (trigger-maintained vote_count), and poll_votes with a UNIQUE
-- (poll_id, user_id) — the real one-vote guard. Votes are insert-only (no
-- update/delete policy) so a cast is LOCKED. Results are anonymous: you may read
-- only your OWN vote row; everyone reads aggregate vote_count. A pg_cron job
-- notifies the author 'poll_closed' with the winner once the timer expires
-- (023/032 pattern). Voting defers to posts RLS, so post visibility is respected.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'poll_closed';

CREATE TABLE IF NOT EXISTS polls (
  post_id         UUID PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  closes_at       TIMESTAMPTZ NOT NULL,
  closed_notified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_options (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id    UUID NOT NULL REFERENCES polls(post_id) ON DELETE CASCADE,
  idx        INT  NOT NULL,           -- 0-based display order
  label      TEXT NOT NULL,
  vote_count INT  NOT NULL DEFAULT 0,
  UNIQUE (poll_id, idx)
);
CREATE INDEX IF NOT EXISTS poll_options_poll_idx ON poll_options (poll_id);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id    UUID NOT NULL REFERENCES polls(post_id) ON DELETE CASCADE,
  option_id  UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (poll_id, user_id)      -- one vote per user per poll (the guard)
);
CREATE INDEX IF NOT EXISTS poll_votes_option_idx ON poll_votes (option_id);

ALTER TABLE polls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes   ENABLE ROW LEVEL SECURITY;

-- polls / poll_options: readable iff you can read the post (defers to posts RLS).
DROP POLICY IF EXISTS "polls_select" ON polls;
CREATE POLICY "polls_select" ON polls
  FOR SELECT TO authenticated USING (post_id IN (SELECT id FROM posts));

DROP POLICY IF EXISTS "poll_options_select" ON poll_options;
CREATE POLICY "poll_options_select" ON poll_options
  FOR SELECT TO authenticated USING (poll_id IN (SELECT id FROM posts));

-- Insert: only the post author seeds the poll + its options (they own the post).
DROP POLICY IF EXISTS "polls_insert" ON polls;
CREATE POLICY "polls_insert" ON polls
  FOR INSERT TO authenticated WITH CHECK (
    post_id IN (SELECT id FROM posts WHERE author_id = auth.uid())
  );
DROP POLICY IF EXISTS "poll_options_insert" ON poll_options;
CREATE POLICY "poll_options_insert" ON poll_options
  FOR INSERT TO authenticated WITH CHECK (
    poll_id IN (SELECT id FROM posts WHERE author_id = auth.uid())
  );

-- Votes: you may read only your OWN vote (anonymity); insert only your own vote,
-- only on a visible poll, only while open. No UPDATE/DELETE policy → locked.
DROP POLICY IF EXISTS "poll_votes_select_own" ON poll_votes;
CREATE POLICY "poll_votes_select_own" ON poll_votes
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "poll_votes_insert" ON poll_votes;
CREATE POLICY "poll_votes_insert" ON poll_votes
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND poll_id IN (SELECT id FROM posts)
    AND EXISTS (
      SELECT 1 FROM polls pl WHERE pl.post_id = poll_votes.poll_id
        AND pl.closes_at > NOW()
    )
    AND option_id IN (SELECT id FROM poll_options WHERE poll_id = poll_votes.poll_id)
  );

-- vote_count maintenance (insert-only; votes are immutable).
CREATE OR REPLACE FUNCTION on_poll_vote()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE poll_options SET vote_count = vote_count + 1 WHERE id = NEW.option_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_poll_vote ON poll_votes;
CREATE TRIGGER on_poll_vote
  AFTER INSERT ON poll_votes
  FOR EACH ROW EXECUTE FUNCTION on_poll_vote();

-- poll_closed: once past closes_at, notify the author with the winning option
-- (ties -> lowest idx). One notification per poll (closed_notified flag).
CREATE OR REPLACE FUNCTION notify_closed_polls()
RETURNS void AS $$
DECLARE
  due_ids UUID[];
BEGIN
  SELECT array_agg(post_id) INTO due_ids
  FROM polls
  WHERE closed_notified = FALSE AND closes_at <= NOW();

  IF due_ids IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (recipient_id, sender_id, type, payload)
  SELECT p.author_id, NULL, 'poll_closed',
         jsonb_build_object(
           'post_id', p.id,
           'question', p.body,
           'winner', win.label,
           'votes', win.vote_count)
  FROM posts p
  JOIN LATERAL (
    SELECT o.label, o.vote_count
    FROM poll_options o
    WHERE o.poll_id = p.id
    ORDER BY o.vote_count DESC, o.idx ASC
    LIMIT 1
  ) win ON TRUE
  WHERE p.id = ANY(due_ids);

  UPDATE polls SET closed_notified = TRUE WHERE post_id = ANY(due_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('close-expired-polls');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'close-expired-polls',
  '*/5 * * * *',
  $$SELECT notify_closed_polls()$$
);
