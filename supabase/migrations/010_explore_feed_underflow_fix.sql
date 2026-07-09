-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: explore_feed() crashed with "value out of range: underflow" (SQLSTATE
-- 22003) whenever the result set contained an event far from the viewer.
-- Postgres exp() underflows (errors, not returns 0) once its argument drops
-- below ~-745, so exp(-distance_m / 5000) for an event on another continent
-- (distance ~1e7 m → exp(-2600)) aborted the entire query. The feed therefore
-- failed the moment a GPS fix arrived and any far-away public event was in range.
--
-- Same fix applied directly in 009 for fresh installs; run THIS file to patch a
-- database that already has 009. CREATE OR REPLACE keeps the signature, so no
-- DROP is needed.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION explore_feed(
  p_user_id        UUID,
  user_lat         FLOAT DEFAULT NULL,
  user_lng         FLOAT DEFAULT NULL,
  activity_filter  activity_type DEFAULT NULL,
  p_limit          INT DEFAULT 10,
  p_offset         INT DEFAULT 0
)
RETURNS TABLE (
  id                UUID,
  host_id           UUID,
  host_name         TEXT,
  host_photo_url    TEXT,
  activity          activity_type,
  title             TEXT,
  description       TEXT,
  image_url         TEXT,
  location_name     TEXT,
  starts_at         TIMESTAMPTZ,
  ends_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ,
  max_people        INT,
  is_public         BOOLEAN,
  requires_approval BOOLEAN,
  distance_m        FLOAT,
  participant_count INT,
  friends_count     INT,
  lat               FLOAT,
  lng               FLOAT,
  score             FLOAT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  viewer_interests activity_type[];
  friend_ids       UUID[];
BEGIN
  SELECT p.interests INTO viewer_interests FROM profiles p WHERE p.id = p_user_id;

  SELECT array_agg(
           CASE WHEN f.requester_id = p_user_id THEN f.addressee_id
                ELSE f.requester_id END)
    INTO friend_ids
    FROM friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = p_user_id OR f.addressee_id = p_user_id);
  friend_ids := COALESCE(friend_ids, ARRAY[]::UUID[]);

  RETURN QUERY
  WITH base AS (
    SELECT
      e.id, e.host_id, e.activity, e.title, e.description, e.image_url,
      e.location_name, e.starts_at, e.ends_at, e.created_at, e.max_people,
      e.is_public, e.requires_approval,
      CASE
        WHEN user_lat IS NULL OR user_lng IS NULL THEN NULL
        ELSE ST_Distance(e.location, ST_MakePoint(user_lng, user_lat)::geography)
      END AS dist_m,
      ST_Y(e.location::geometry) AS e_lat,
      ST_X(e.location::geometry) AS e_lng,
      COUNT(ep.user_id) FILTER (WHERE ep.status = 'approved')::INT AS p_count,
      (
        SELECT COUNT(DISTINCT u)::INT FROM (
          SELECT ep2.user_id AS u
            FROM event_participants ep2
            WHERE ep2.event_id = e.id
              AND ep2.status = 'approved'
              AND ep2.user_id = ANY(friend_ids)
          UNION
          SELECT e.host_id WHERE e.host_id = ANY(friend_ids)
        ) z
      ) AS f_count
    FROM events e
    LEFT JOIN event_participants ep ON ep.event_id = e.id
    WHERE e.is_active = TRUE
      AND e.is_public = TRUE
      AND (activity_filter IS NULL OR e.activity = activity_filter)
      AND (e.ends_at IS NULL OR e.ends_at > NOW())
    GROUP BY e.id
  )
  SELECT
    b.id, b.host_id, pr.name, pr.photo_url, b.activity, b.title, b.description,
    b.image_url, b.location_name, b.starts_at, b.ends_at, b.created_at,
    b.max_people, b.is_public, b.requires_approval,
    b.dist_m, b.p_count, b.f_count, b.e_lat, b.e_lng,
    (
      -- popularity: more people = hotter (diminishing returns)
      10.0 * ln(1 + b.p_count)
      -- proximity: closer is better, ~5km half-life; 0 when location unknown.
      -- GREATEST clamps the exponent so a distant event can't underflow exp().
      + CASE WHEN b.dist_m IS NULL THEN 0
             ELSE 15.0 * exp(GREATEST(-b.dist_m / 5000.0, -700.0)) END
      -- starts soon: ongoing gets a flat boost, upcoming decays over ~1 day
      + CASE WHEN b.starts_at <= NOW() THEN 6.0
             ELSE 12.0 * exp(GREATEST(-EXTRACT(EPOCH FROM (b.starts_at - NOW())) / 86400.0, -700.0)) END
      -- freshness: newly created posts surface, decays over ~2 days
      + 6.0 * exp(GREATEST(-EXTRACT(EPOCH FROM (NOW() - b.created_at)) / 172800.0, -700.0))
      -- social proof: friends hosting or going
      + 8.0 * b.f_count
      -- interest match
      + CASE WHEN viewer_interests IS NOT NULL AND b.activity = ANY(viewer_interests)
             THEN 7.0 ELSE 0 END
    )::FLOAT AS score
  FROM base b
  JOIN profiles pr ON pr.id = b.host_id
  ORDER BY score DESC, b.starts_at ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
