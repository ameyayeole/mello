-- ─────────────────────────────────────────────────────────────────────────────
-- READ RPCS v2: top-level + reply reads now also return liked_by_me (viewer's
-- like state on each comment) and the ranking folds in comment like_count. Uses
-- p_viewer_id (previously reserved). SECURITY INVOKER. Both need DROP first
-- (return-type change). Run whole in the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS post_comments_ranked(UUID, UUID, INT);
CREATE OR REPLACE FUNCTION post_comments_ranked(
  p_post_id   UUID,
  p_viewer_id UUID,
  p_limit     INT DEFAULT 100
)
RETURNS TABLE (
  id UUID, author_id UUID, author_name TEXT, author_photo_url TEXT,
  body TEXT, mentions UUID[], like_count INT, reply_count BIGINT,
  deleted BOOLEAN, liked_by_me BOOLEAN, created_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  WITH post_author AS (SELECT author_id FROM posts WHERE id = p_post_id)
  SELECT
    c.id, c.author_id, pr.name, pr.photo_url,
    CASE WHEN c.deleted_at IS NULL THEN c.body ELSE NULL END,
    c.mentions, c.like_count,
    (SELECT count(*) FROM post_comments r WHERE r.parent_id = c.id) AS reply_count,
    (c.deleted_at IS NOT NULL) AS deleted,
    EXISTS (SELECT 1 FROM comment_likes cl
            WHERE cl.comment_id = c.id AND cl.user_id = p_viewer_id) AS liked_by_me,
    c.created_at
  FROM post_comments c
  JOIN profiles pr ON pr.id = c.author_id
  WHERE c.post_id = p_post_id AND c.parent_id IS NULL
  ORDER BY
    -- Relevancy (tunable): likes + replies + author/friend boosts, recency tiebreak.
    c.like_count
    + (SELECT count(*) FROM post_comments r WHERE r.parent_id = c.id) * 2
    + CASE WHEN c.author_id = (SELECT author_id FROM post_author) THEN 5 ELSE 0 END
    + CASE WHEN EXISTS (
        SELECT 1 FROM friendships f WHERE f.status = 'accepted'
          AND ((f.requester_id = p_viewer_id AND f.addressee_id = c.author_id)
            OR (f.addressee_id = p_viewer_id AND f.requester_id = c.author_id))
      ) THEN 3 ELSE 0 END DESC,
    c.created_at DESC
  LIMIT p_limit;
$$;

DROP FUNCTION IF EXISTS post_comment_replies(UUID, UUID);
CREATE OR REPLACE FUNCTION post_comment_replies(
  p_parent_id UUID,
  p_viewer_id UUID
)
RETURNS TABLE (
  id UUID, author_id UUID, author_name TEXT, author_photo_url TEXT,
  body TEXT, mentions UUID[], like_count INT, deleted BOOLEAN,
  liked_by_me BOOLEAN, created_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
  SELECT
    c.id, c.author_id, pr.name, pr.photo_url,
    CASE WHEN c.deleted_at IS NULL THEN c.body ELSE NULL END,
    c.mentions, c.like_count, (c.deleted_at IS NOT NULL),
    EXISTS (SELECT 1 FROM comment_likes cl
            WHERE cl.comment_id = c.id AND cl.user_id = p_viewer_id) AS liked_by_me,
    c.created_at
  FROM post_comments c
  JOIN profiles pr ON pr.id = c.author_id
  WHERE c.parent_id = p_parent_id
  ORDER BY c.created_at ASC;
$$;
