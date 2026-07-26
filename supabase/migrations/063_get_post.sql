-- ─────────────────────────────────────────────────────────────────────────────
-- GET_POST: one post in the community_feed row shape, for the post detail screen
-- (deep links + notification tap-through). SECURITY INVOKER → posts RLS decides
-- visibility, so a viewer who can't see it (or a hidden post) gets no row and the
-- screen shows "unavailable". Run whole file in the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_post(UUID, UUID);
CREATE OR REPLACE FUNCTION get_post(p_post_id UUID, p_user_id UUID)
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
  ref_wrap_event_id UUID,
  score             FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id, p.author_id, pr.name, pr.p     hoto_url, p.type, p.visibility,
    p.body, p.media, p.city, p.like_count, p.comment_count, p.created_at,
    EXISTS (SELECT 1 FROM post_likes pl
            WHERE pl.post_id = p.id AND pl.user_id = p_user_id) AS liked_by_me,
    p.comments_enabled,
    p.ref_wrap_event_id,
    p.score
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  WHERE p.id = p_post_id AND p.hidden = FALSE;
$$;
