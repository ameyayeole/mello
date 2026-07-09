-- ─────────────────────────────────────────────────────────────────────────────
-- 017: Map pins show the host's photo — add host_name / host_photo_url to
-- events_within_radius. The return type changes, so the old function must be
-- dropped first (CREATE OR REPLACE can't change a RETURNS TABLE shape).
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS events_within_radius(FLOAT, FLOAT, FLOAT, activity_type);

CREATE FUNCTION events_within_radius(
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
  lng               FLOAT,
  host_name         TEXT,
  host_photo_url    TEXT
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
    ST_X(e.location::geometry) AS lng,
    p.name AS host_name,
    -- Prefer the gallery's first photo (the profile "main" photo); photo_url
    -- only exists on profiles created before the gallery.
    COALESCE(p.photos[1], p.photo_url) AS host_photo_url
  FROM events e
  JOIN profiles p ON p.id = e.host_id
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
  GROUP BY e.id, p.name, p.photos, p.photo_url
  ORDER BY distance_m ASC;
END;
$$;
