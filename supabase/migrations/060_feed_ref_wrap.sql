-- ─────────────────────────────────────────────────────────────────────────────
-- FEED v4 + USER POSTS v2: also return ref_wrap_event_id so a shared_wrap card
-- can resolve its event. One added output column on each → DROP first (RETURNS
-- TABLE change). Same shape/keyset otherwise. Run this whole file in the editor.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS community_feed(UUID, TIMESTAMPTZ, UUID, INT);
CREATE OR REPLACE FUNCTION community_feed(
  p_user_id           UUID,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id         UUID        DEFAULT NULL,
  p_limit             INT         DEFAULT 10
)
RETURNS TABLE (
  id                UUID,
  author_id         UUID,
  author_name       TEXT,
  author_photo_url  TEXT,
  type              post_type,
  visibility        post_visibility,
  body              TEXT,
  media             TEXT[],
  city              TEXT,
  like_count        INT,
  comment_count     INT,
  created_at        TIMESTAMPTZ,
  liked_by_me       BOOLEAN,
  comments_enabled  BOOLEAN,
  ref_wrap_event_id UUID
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id, p.author_id, pr.name, pr.photo_url, p.type, p.visibility,
    p.body, p.media, p.city, p.like_count, p.comment_count, p.created_at,
    EXISTS (
      SELECT 1 FROM post_likes pl
      WHERE pl.post_id = p.id AND pl.user_id = p_user_id
    ) AS liked_by_me,
    p.comments_enabled,
    p.ref_wrap_event_id
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  WHERE (
    p_cursor_created_at IS NULL
    OR (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id)
  )
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT p_limit;
$$;

DROP FUNCTION IF EXISTS user_posts(UUID, UUID, TIMESTAMPTZ, UUID, INT);
CREATE OR REPLACE FUNCTION user_posts(
  p_target_id         UUID,
  p_viewer_id         UUID,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id         UUID        DEFAULT NULL,
  p_limit             INT         DEFAULT 12
)
RETURNS TABLE (
  id                UUID,
  author_id         UUID,
  author_name       TEXT,
  author_photo_url  TEXT,
  type              post_type,
  visibility        post_visibility,
  body              TEXT,
  media             TEXT[],
  city              TEXT,
  like_count        INT,
  comment_count     INT,
  created_at        TIMESTAMPTZ,
  liked_by_me       BOOLEAN,
  comments_enabled  BOOLEAN,
  ref_wrap_event_id UUID
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id, p.author_id, pr.name, pr.photo_url, p.type, p.visibility,
    p.body, p.media, p.city, p.like_count, p.comment_count, p.created_at,
    EXISTS (
      SELECT 1 FROM post_likes pl
      WHERE pl.post_id = p.id AND pl.user_id = p_viewer_id
    ) AS liked_by_me,
    p.comments_enabled,
    p.ref_wrap_event_id
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  WHERE p.author_id = p_target_id
    AND (
      p_cursor_created_at IS NULL
      OR (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT p_limit;
$$;
