-- ─────────────────────────────────────────────────────────────────────────────
-- LIKES ON COMMENTS: one like per user per comment; count maintained on
-- post_comments.like_count; comment author notified via the coalesced helper
-- (049). Mirror of post_likes (046). Run whole in the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'comment_liked';

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id UUID NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS comment_likes_user_idx ON comment_likes (user_id);

ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

-- Visible iff you can read the comment (which defers to the post's RLS).
DROP POLICY IF EXISTS "comment_likes_select" ON comment_likes;
CREATE POLICY "comment_likes_select" ON comment_likes
  FOR SELECT TO authenticated USING (comment_id IN (SELECT id FROM post_comments));

DROP POLICY IF EXISTS "comment_likes_insert" ON comment_likes;
CREATE POLICY "comment_likes_insert" ON comment_likes
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND comment_id IN (SELECT id FROM post_comments)
  );

DROP POLICY IF EXISTS "comment_likes_delete" ON comment_likes;
CREATE POLICY "comment_likes_delete" ON comment_likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION on_comment_like()
RETURNS TRIGGER AS $$
DECLARE
  v_author UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE post_comments SET like_count = like_count + 1 WHERE id = NEW.comment_id
      RETURNING author_id INTO v_author;
    PERFORM coalesce_notification(v_author, NEW.user_id,
              'comment_liked', 'comment_id', NEW.comment_id);
    RETURN NEW;
  ELSE
    UPDATE post_comments SET like_count = GREATEST(like_count - 1, 0)
      WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_comment_like ON comment_likes;
CREATE TRIGGER on_comment_like
  AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW EXECUTE FUNCTION on_comment_like();
