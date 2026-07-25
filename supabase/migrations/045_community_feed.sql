-- ─────────────────────────────────────────────────────────────────────────────
-- COMMUNITY FEED: reverse-chronological, keyset-paginated feed of visible posts.
-- Visibility, blocks and friends are enforced by posts' RLS (SECURITY INVOKER),
-- so this function only scopes and paginates. Phase 6 swaps the ORDER BY for a
-- materialised hybrid score; the keyset shape stays. Run whole in SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS community_feed(UUID, TIMESTAMPTZ, UUID, INT);
CREATE OR REPLACE FUNCTION community_feed(
  -- Unused so far: scoping is entirely via RLS auth.uid() (SECURITY INVOKER
  -- below). Reserved for Phase 6's hybrid-score signal (e.g. affinity to
  -- p_user_id's friends/city). Kept in the signature now to avoid another
  -- breaking DROP FUNCTION once that lands.
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
  created_at        TIMESTAMPTZ
)
-- SECURITY INVOKER (the default): posts' RLS runs as the calling user, so the
-- visibility/block/friends rules from Task 1 apply without re-implementing them.
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id, p.author_id, pr.name, pr.photo_url, p.type, p.visibility,
    p.body, p.media, p.city, p.like_count, p.comment_count, p.created_at
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  WHERE
    -- Keyset: strictly older than the cursor. NULL cursor = first page.
    (
      p_cursor_created_at IS NULL
      OR (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT p_limit;
$$;
