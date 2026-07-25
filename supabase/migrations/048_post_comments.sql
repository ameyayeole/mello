-- ─────────────────────────────────────────────────────────────────────────────
-- COMMUNITY COMMENTS: flat top-level + one level of replies (parent_id). Generic
-- like wrap_photo_comments but richer: self-ref parent, tombstone (deleted_at),
-- trigger-maintained posts.comment_count. Comment LIKES + reports + mentions are
-- Phase 2c (like_count/mentions columns laid down now). Run whole in SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Post authors can switch comments off per post.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS post_comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- NULL = top-level; set = a reply to another comment. One level only (trigger).
  parent_id  UUID REFERENCES post_comments(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  mentions   UUID[] NOT NULL DEFAULT '{}',
  like_count INT NOT NULL DEFAULT 0,
  -- Tombstone: a deleted parent that still has replies stays as "comment removed".
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Live comments carry 1–500 chars; a tombstone blanks the body, so exempt it.
  CONSTRAINT post_comments_body_len
    CHECK (deleted_at IS NOT NULL OR char_length(btrim(body)) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS post_comments_post_idx   ON post_comments (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS post_comments_parent_idx ON post_comments (parent_id, created_at);

-- Enforce exactly one level: a reply's parent must itself be top-level, and a
-- reply must live on the same post as its parent.
CREATE OR REPLACE FUNCTION enforce_comment_one_level()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM post_comments p
               WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'comments are one level deep: cannot reply to a reply';
    END IF;
    IF (SELECT post_id FROM post_comments WHERE id = NEW.parent_id) <> NEW.post_id THEN
      RAISE EXCEPTION 'reply post_id must match parent post_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_comment_one_level ON post_comments;
CREATE TRIGGER enforce_comment_one_level
  BEFORE INSERT ON post_comments
  FOR EACH ROW EXECUTE FUNCTION enforce_comment_one_level();

-- Maintain posts.comment_count = count of live (non-tombstoned) comments.
CREATE OR REPLACE FUNCTION on_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  ELSE
    -- UPDATE: only a transition into tombstone decrements (the row stays but
    -- stops counting as a live comment).
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.post_id;
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_comment_count ON post_comments;
CREATE TRIGGER on_post_comment_count
  AFTER INSERT OR DELETE OR UPDATE ON post_comments
  FOR EACH ROW EXECUTE FUNCTION on_post_comment_count();

ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: you can read a comment iff you can read its post (defers to posts RLS).
DROP POLICY IF EXISTS "post_comments_select" ON post_comments;
CREATE POLICY "post_comments_select" ON post_comments
  FOR SELECT TO authenticated USING (post_id IN (SELECT id FROM posts));

-- INSERT: your own comment, on a post you can see, that has comments enabled.
DROP POLICY IF EXISTS "post_comments_insert" ON post_comments;
CREATE POLICY "post_comments_insert" ON post_comments
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid()
    AND post_id IN (SELECT id FROM posts WHERE comments_enabled = TRUE)
  );

-- UPDATE (tombstone): the comment author OR the post's author.
DROP POLICY IF EXISTS "post_comments_update" ON post_comments;
CREATE POLICY "post_comments_update" ON post_comments
  FOR UPDATE TO authenticated USING (
    author_id = auth.uid()
    OR post_id IN (SELECT id FROM posts WHERE author_id = auth.uid())
  );

-- DELETE (hard, for a leaf): the comment author OR the post's author.
DROP POLICY IF EXISTS "post_comments_delete" ON post_comments;
CREATE POLICY "post_comments_delete" ON post_comments
  FOR DELETE TO authenticated USING (
    author_id = auth.uid()
    OR post_id IN (SELECT id FROM posts WHERE author_id = auth.uid())
  );
