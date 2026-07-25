-- ─────────────────────────────────────────────────────────────────────────────
-- COMMUNITY FEED v5: hybrid ranked + fallback ladder + cross-city KYC/velocity
-- gate + hidden filter. posts.score (materialized, 061) is the frozen base;
-- friend/same-city boosts are added here per viewer so the order is stable in a
-- session. Cross-city public posts join the pool only if the author is KYC'd and
-- the post clears an age + distinct-engager floor. Keyset on (score, created_at,
-- id) — never offset. New signature (adds p_cursor_score). Run whole file.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS community_feed(UUID, TIMESTAMPTZ, UUID, INT);
DROP FUNCTION IF EXISTS community_feed(UUID, FLOAT, TIMESTAMPTZ, UUID, INT);
CREATE OR REPLACE FUNCTION community_feed(
  p_user_id           UUID,
  p_cursor_score      FLOAT       DEFAULT NULL,
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
  ref_wrap_event_id UUID,
  score             FLOAT
)
LANGUAGE sql STABLE
AS $$
  WITH viewer AS (
    SELECT city AS vcity FROM profiles WHERE id = p_user_id
  ),
  ranked AS (
    SELECT
      p.*,
      pr.name       AS a_name,
      pr.photo_url  AS a_photo,
      (p.author_id = p_user_id) AS is_own,
      EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = 'accepted'
          AND ((f.requester_id = p_user_id AND f.addressee_id = p.author_id)
            OR (f.addressee_id = p_user_id AND f.requester_id = p.author_id))
      ) AS is_friend,
      (p.city IS NOT DISTINCT FROM (SELECT vcity FROM viewer)) AS same_city,
      pr.kyc_status AS a_kyc,
      (
        SELECT COUNT(DISTINCT u) FROM (
          SELECT pl.user_id AS u FROM post_likes pl WHERE pl.post_id = p.id
          UNION
          SELECT pc.author_id AS u FROM post_comments pc
            WHERE pc.post_id = p.id AND pc.deleted_at IS NULL
        ) e
      ) AS engagers
    FROM posts p
    JOIN profiles pr ON pr.id = p.author_id
    WHERE p.hidden = FALSE
  )
  SELECT
    r.id, r.author_id, r.a_name, r.a_photo, r.type, r.visibility,
    r.body, r.media, r.city, r.like_count, r.comment_count, r.created_at,
    EXISTS (SELECT 1 FROM post_likes pl
            WHERE pl.post_id = r.id AND pl.user_id = p_user_id) AS liked_by_me,
    r.comments_enabled,
    r.ref_wrap_event_id,
    (r.score
      + CASE WHEN r.is_friend THEN 100.0 ELSE 0 END
      + CASE WHEN r.same_city THEN 50.0 ELSE 0 END)::FLOAT AS score
  FROM ranked r
  WHERE
    (
      -- Local pool: yours, friends', or same-city — always allowed.
      (r.is_own OR r.is_friend OR r.same_city)
      -- Cross-city pool: public + KYC'd author + age & distinct-engager floor.
      OR (
        r.visibility = 'public'
        AND r.a_kyc = 'approved'
        AND r.created_at < NOW() - INTERVAL '30 minutes'
        AND r.engagers >= 3
      )
    )
    -- Keyset over the FINAL score (base + viewer boosts), then recency, then id.
    -- p_cursor_score NULL ⇒ first page. WHERE can't see the SELECT alias, so the
    -- score expression is repeated verbatim here.
    AND (
      p_cursor_score IS NULL
      OR (
        (r.score
          + CASE WHEN r.is_friend THEN 100.0 ELSE 0 END
          + CASE WHEN r.same_city THEN 50.0 ELSE 0 END),
        r.created_at, r.id
      ) < (p_cursor_score, p_cursor_created_at, p_cursor_id)
    )
  ORDER BY score DESC, r.created_at DESC, r.id DESC
  LIMIT p_limit;
$$;
