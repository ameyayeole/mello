-- ─────────────────────────────────────────────────────────────────────────────
-- USER POSTS: one author's posts for the Profile "Posts" tab, newest-first,
-- keyset-paginated. SECURITY INVOKER, so posts' RLS (migration 044) enforces
-- viewer-scoped visibility (stranger→public, friend→public+friends, self→all)
-- and the block check — this function only scopes to p_target_id and paginates.
-- Same RETURNS shape as community_feed so the client reuses CommunityPost.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
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
  comments_enabled  BOOLEAN
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
    p.comments_enabled
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
