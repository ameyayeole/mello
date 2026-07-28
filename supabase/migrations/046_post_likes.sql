-- ─────────────────────────────────────────────────────────────────────────────
-- COMMUNITY LIKES: one like per user per post, count maintained by trigger,
-- author notified via a COALESCED notification (one row per (recipient, post),
-- bumped on each new like within a rolling window). Mirrors wrap_photo_likes
-- (032) for the table/RLS/count shape; the coalescing logic is the new primitive.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- New notification type (Postgres enum side; the TS union is updated in Task 3).
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'post_liked';

CREATE TABLE IF NOT EXISTS post_likes (
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS post_likes_user_idx ON post_likes (user_id);

ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

-- SELECT: you can see a like only if you can see its post (defers to posts RLS:
-- the subquery only returns post ids the caller is allowed to read).
DROP POLICY IF EXISTS "post_likes_select" ON post_likes;
CREATE POLICY "post_likes_select" ON post_likes
  FOR SELECT TO authenticated USING (
    post_id IN (SELECT id FROM posts)
  );

-- INSERT: only your own like, and only on a post you can see.
DROP POLICY IF EXISTS "post_likes_insert" ON post_likes;
CREATE POLICY "post_likes_insert" ON post_likes
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND post_id IN (SELECT id FROM posts)
  );

-- DELETE: only your own like.
DROP POLICY IF EXISTS "post_likes_delete" ON post_likes;
CREATE POLICY "post_likes_delete" ON post_likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Count maintenance + coalesced author notification ────────────────────────
-- The coalescing lives inline in the INSERT branch (one trigger, NEW in scope).
-- One notification row per (recipient, post, 'post_liked'): the first like INSERTs
-- it (the AFTER INSERT push trigger fires once → a real push); each later like
-- within the window UPDATEs that same row — bumps payload.count and prepends the
-- new actor — so push_notification_fanout does NOT re-fire (silent bump). A fresh
-- row reopens once the old one is read or ages past the window.
CREATE OR REPLACE FUNCTION on_post_like()
RETURNS TRIGGER AS $$
DECLARE
  v_author   UUID;
  v_actor    TEXT;
  v_existing RECORD;
  v_window   INTERVAL := INTERVAL '24 hours';
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id
    RETURNING author_id INTO v_author;

    -- Never notify your own like.
    IF v_author IS NULL OR v_author = NEW.user_id THEN
      RETURN NEW;
    END IF;

    SELECT name INTO v_actor FROM profiles WHERE id = NEW.user_id;

    -- Most recent unread, in-window like-notification for this post + recipient.
    SELECT * INTO v_existing
    FROM notifications
    WHERE recipient_id = v_author
      AND type = 'post_liked'
      AND (payload->>'post_id')::uuid = NEW.post_id
      AND is_read = FALSE
      AND created_at > NOW() - v_window
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
      -- Bump: count + 1, newest actor first, preview capped at 3 names.
      UPDATE notifications
      SET sender_id = NEW.user_id,
          payload = jsonb_set(
            jsonb_set(v_existing.payload, '{count}',
              to_jsonb(COALESCE((v_existing.payload->>'count')::int, 1) + 1)),
            '{actors}',
            (SELECT jsonb_agg(a)
             FROM (
               SELECT a FROM jsonb_array_elements(
                 to_jsonb(v_actor) || COALESCE(v_existing.payload->'actors', '[]'::jsonb)
               ) WITH ORDINALITY AS t(a, ord)
               ORDER BY ord LIMIT 3
             ) capped)),
          created_at = NOW()
      WHERE id = v_existing.id;
    ELSE
      INSERT INTO notifications (recipient_id, sender_id, type, payload)
      VALUES (v_author, NEW.user_id, 'post_liked',
              jsonb_build_object(
                'post_id', NEW.post_id,
                'count', 1,
                'actors', jsonb_build_array(v_actor)));
    END IF;

    RETURN NEW;
  ELSE
    UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_like ON post_likes;
CREATE TRIGGER on_post_like
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION on_post_like();
