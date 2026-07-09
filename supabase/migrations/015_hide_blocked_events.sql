-- ─────────────────────────────────────────────────────────────────────────────
-- Hide events hosted by a blocked user from the map and the Explore feed.
-- A block hides the host's events in BOTH directions: if either side blocked the
-- other, the viewer no longer sees that host's events.
--   • events_within_radius (map)   — viewer = auth.uid() (SECURITY INVOKER).
--   • explore_feed (Explore feed)  — viewer = p_user_id (already passed in).
-- Both keep their existing signatures, so CREATE OR REPLACE is enough.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── MAP: events_within_radius ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION events_within_radius(
  user_lat         FLOAT,
  user_lng         FLOAT,
  radius_m         FLOAT DEFAULT 5000,
  activity_filter  activity_type DEFAULT NULL
)
RETURNS TABLE (
  id                UUID,
  host_id           UUID,
  activity          activity_type,
  title             TEXT,
  description       TEXT,
  location_name     TEXT,
  starts_at         TIMESTAMPTZ,
  ends_at           TIMESTAMPTZ,
  max_people        INT,
  is_public         BOOLEAN,
  requires_approval BOOLEAN,
  distance_m        FLOAT,
  participant_count INT,
  lat               FLOAT,
  lng               FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.host_id, e.activity, e.title, e.description, e.location_name,
    e.starts_at, e.ends_at, e.max_people, e.is_public, e.requires_approval,
    ST_Distance(e.location, ST_MakePoint(user_lng, user_lat)::geography) AS distance_m,
    COUNT(ep.user_id) FILTER (WHERE ep.status = 'approved')::INT AS participant_count,
    ST_Y(e.location::geometry) AS lat,
    ST_X(e.location::geometry) AS lng
  FROM events e
  LEFT JOIN event_participants ep ON ep.event_id = e.id
  WHERE
    e.is_active = TRUE
    AND e.is_public = TRUE
    AND ST_DWithin(e.location, ST_MakePoint(user_lng, user_lat)::geography, radius_m)
    AND (activity_filter IS NULL OR e.activity = activity_filter)
    AND (e.ends_at IS NULL OR e.ends_at > NOW())
    -- Hide hosts in a block relationship with the viewer (either direction).
    AND NOT EXISTS (
      SELECT 1 FROM blocks bl
      WHERE (bl.blocker_id = auth.uid() AND bl.blocked_id = e.host_id)
         OR (bl.blocker_id = e.host_id AND bl.blocked_id = auth.uid())
    )
  GROUP BY e.id
  ORDER BY distance_m ASC;
END;
$$;

-- ─── EXPLORE: explore_feed ───────────────────────────────────────────────────
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
      -- Hide hosts in a block relationship with the viewer (either direction).
      AND NOT EXISTS (
        SELECT 1 FROM blocks bl
        WHERE (bl.blocker_id = p_user_id AND bl.blocked_id = e.host_id)
           OR (bl.blocker_id = e.host_id AND bl.blocked_id = p_user_id)
      )
    GROUP BY e.id
  )
  SELECT
    b.id, b.host_id, pr.name, pr.photo_url, b.activity, b.title, b.description,
    b.image_url, b.location_name, b.starts_at, b.ends_at, b.created_at,
    b.max_people, b.is_public, b.requires_approval,
    b.dist_m, b.p_count, b.f_count, b.e_lat, b.e_lng,
    (
      10.0 * ln(1 + b.p_count)
      + CASE WHEN b.dist_m IS NULL THEN 0
             ELSE 15.0 * exp(GREATEST(-b.dist_m / 5000.0, -700.0)) END
      + CASE WHEN b.starts_at <= NOW() THEN 6.0
             ELSE 12.0 * exp(GREATEST(-EXTRACT(EPOCH FROM (b.starts_at - NOW())) / 86400.0, -700.0)) END
      + 6.0 * exp(GREATEST(-EXTRACT(EPOCH FROM (NOW() - b.created_at)) / 172800.0, -700.0))
      + 8.0 * b.f_count
      + CASE WHEN viewer_interests IS NOT NULL AND b.activity = ANY(viewer_interests)
             THEN 7.0 ELSE 0 END
    )::FLOAT AS score
  FROM base b
  JOIN profiles pr ON pr.id = b.host_id
  ORDER BY score DESC, b.starts_at ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
