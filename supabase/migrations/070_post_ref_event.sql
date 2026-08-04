-- ─────────────────────────────────────────────────────────────────────────────
-- 070: Link an event to a post. An author can attach one of their own events
-- (hosting or attending) to any post — text, photo or poll — so a caption can
-- point at the thing it is about and readers can open it from the feed.
--
-- A separate column from ref_wrap_event_id (059), not a reuse of it. That one
-- means "the wrap of an event I attended" and is required on shared_wrap posts;
-- this one means "the event this post is about" and is optional on every type.
-- Folding them together would make `type` no longer say what the reference is.
--
-- Deliberately NOT a new post_type. A linked event is orthogonal to what the
-- post *is* — a poll about an event is still a poll — and a type would make the
-- two mutually exclusive.
--
-- Who may link is enforced here, not in the picker: the composer only lists
-- your own events, but a client-side list is not a permission. is_event_attendee
-- (032) covers hosts and approved participants alike (043 made the host an
-- approved participant of their own event).
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS ref_event_id UUID REFERENCES events(id) ON DELETE SET NULL;

-- ─── INSERT: your own post; referenced events must be ones you're part of ────
-- Carries forward 059's shared_wrap clause verbatim — this policy is the only
-- posts_insert, so dropping it would take that rule with it.
DROP POLICY IF EXISTS "posts_insert" ON posts;
CREATE POLICY "posts_insert" ON posts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND (
      type <> 'shared_wrap'
      OR is_event_attendee(ref_wrap_event_id, auth.uid())
    )
    AND (
      ref_event_id IS NULL
      OR is_event_attendee(ref_event_id, auth.uid())
    )
  );

-- ─── Readers ────────────────────────────────────────────────────────────────
-- All three must be DROPped first: adding a column to RETURNS TABLE changes the
-- function's return type, which CREATE OR REPLACE cannot do (42P13). Each body
-- below is its current definition plus p.ref_event_id — community_feed_page
-- from 066, user_posts from 060, get_post from 069.

DROP FUNCTION IF EXISTS community_feed_page(UUID, UUID, SMALLINT, BOOLEAN, INT, INT);
CREATE FUNCTION community_feed_page(
  p_user_id    UUID,
  p_session_id UUID     DEFAULT NULL,
  p_tier       SMALLINT DEFAULT 1,
  p_pin_own    BOOLEAN  DEFAULT TRUE,
  p_offset     INT      DEFAULT 0,
  p_limit      INT      DEFAULT 10
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
  ref_wrap_event_id UUID,
  ref_event_id      UUID,
  score             FLOAT,
  session_id        UUID,
  session_total     INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_session UUID := p_session_id;
  v_ids     UUID[];
  v_scores  FLOAT[];
  v_total   INT;
BEGIN
  IF v_session IS NULL THEN
    v_session := build_feed_session(p_user_id, p_tier, p_pin_own);
  END IF;

  SELECT fs.post_ids, fs.post_scores
    INTO v_ids, v_scores
    FROM feed_sessions fs
   WHERE fs.id = v_session AND fs.user_id = p_user_id;

  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'feed session % not found or expired', v_session
      USING ERRCODE = 'no_data_found';
  END IF;

  v_total := COALESCE(array_length(v_ids, 1), 0);

  RETURN QUERY
  SELECT
    p.id, p.author_id, pr.name, pr.photo_url, p.type, p.visibility,
    p.body, p.media, p.city, p.like_count, p.comment_count, p.created_at,
    EXISTS (SELECT 1 FROM post_likes pl
             WHERE pl.post_id = p.id AND pl.user_id = p_user_id) AS liked_by_me,
    p.comments_enabled,
    p.ref_wrap_event_id,
    p.ref_event_id,
    slice.sc,
    v_session,
    v_total
  FROM unnest(
         v_ids[p_offset + 1 : p_offset + p_limit],
         v_scores[p_offset + 1 : p_offset + p_limit]
       ) WITH ORDINALITY AS slice(pid, sc, ord)
  JOIN posts    p  ON p.id = slice.pid AND p.hidden = FALSE
  JOIN profiles pr ON pr.id = p.author_id
  ORDER BY slice.ord;
END;
$$;

DROP FUNCTION IF EXISTS user_posts(UUID, UUID, TIMESTAMPTZ, UUID, INT);
CREATE FUNCTION user_posts(
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
  ref_wrap_event_id UUID,
  ref_event_id      UUID
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
    p.ref_wrap_event_id,
    p.ref_event_id
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

DROP FUNCTION IF EXISTS get_post(UUID, UUID);
CREATE FUNCTION get_post(p_post_id UUID, p_user_id UUID)
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
  ref_event_id      UUID,
  score             FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id, p.author_id, pr.name, pr.photo_url, p.type, p.visibility,
    p.body, p.media, p.city, p.like_count, p.comment_count, p.created_at,
    EXISTS (SELECT 1 FROM post_likes pl
            WHERE pl.post_id = p.id AND pl.user_id = p_user_id) AS liked_by_me,
    p.comments_enabled,
    p.ref_wrap_event_id,
    p.ref_event_id,
    0::FLOAT -- see 069: posts.score is gone; kept only because CommunityPost
             -- declares `score` and nothing reads it on this path.
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  WHERE p.id = p_post_id AND p.hidden = FALSE;
$$;
