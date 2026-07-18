-- ─────────────────────────────────────────────────────────────────────────────
-- 024: MELLO+ PREMIUM
--   • profiles.is_premium / premium_until / premium_plan (guarded like KYC:
--     only the service role / SQL editor can change them)
--   • user_is_premium() helper used by the gates below
--   • event_distance_m(): distance user↔event for the >10 km join gate
--   • daily swipe cap: free users get 10 event_swipes per day (trigger)
--   • saved_events: a premium host can see WHO wishlisted their event (RLS);
--     count_event_savers() gives every host the count for the teaser
--   • events_within_radius / explore_feed gain host_verified for the
--     premium "Verified hosts" filter (return shape changes → DROP first)
-- Run this whole file in the Supabase SQL editor.
--
-- To grant premium manually while payments are stubbed (runs as postgres, so
-- the guard trigger allows it):
--   UPDATE profiles SET is_premium = TRUE, premium_plan = 'monthly',
--     premium_until = NOW() + INTERVAL '30 days' WHERE id = '<user-uuid>';
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_premium    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS premium_plan  TEXT
    CHECK (premium_plan IN ('weekly', 'monthly'));

-- ─── Guard: only the service role may change premium state ───────────────────
-- profiles rows are updatable by their owner, so without this anyone could
-- flip their own is_premium from the client.
CREATE OR REPLACE FUNCTION guard_premium_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
       NEW.is_premium    IS DISTINCT FROM OLD.is_premium
    OR NEW.premium_until IS DISTINCT FROM OLD.premium_until
    OR NEW.premium_plan  IS DISTINCT FROM OLD.premium_plan
  ) THEN
    RAISE EXCEPTION 'premium columns can only be updated by the billing service';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_premium_columns ON profiles;
CREATE TRIGGER trg_guard_premium_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_premium_columns();

-- ─── Helper: is this user premium right now? ──────────────────────────────────
-- premium_until IS NULL = no expiry (manually granted); otherwise it must be
-- in the future. SECURITY DEFINER so RLS policies can call it for any user.
CREATE OR REPLACE FUNCTION user_is_premium(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT p.is_premium
        AND (p.premium_until IS NULL OR p.premium_until > NOW())
     FROM profiles p WHERE p.id = p_user_id),
    FALSE
  );
$$;

-- ─── Distance user↔event, for the >10 km join gate ───────────────────────────
-- The event detail query (SELECT *) can't expose lat/lng from the geography
-- column, so the sheet asks for the distance directly.
CREATE OR REPLACE FUNCTION event_distance_m(p_event_id UUID, p_lat FLOAT, p_lng FLOAT)
RETURNS FLOAT
LANGUAGE sql STABLE
AS $$
  SELECT ST_Distance(e.location, ST_MakePoint(p_lng, p_lat)::geography)
  FROM events e WHERE e.id = p_event_id;
$$;

-- ─── Daily swipe cap: 10/day for free users ───────────────────────────────────
-- Counts today's swipes (undo deletes the row, so an undone swipe is refunded).
CREATE OR REPLACE FUNCTION enforce_swipe_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT user_is_premium(NEW.user_id)
     AND (SELECT COUNT(*) FROM event_swipes s
          WHERE s.user_id = NEW.user_id
            AND s.created_at >= date_trunc('day', NOW())) >= 10
  THEN
    RAISE EXCEPTION 'swipe_limit_reached';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_swipe_limit ON event_swipes;
CREATE TRIGGER trg_enforce_swipe_limit
  BEFORE INSERT ON event_swipes
  FOR EACH ROW
  EXECUTE FUNCTION enforce_swipe_limit();

-- ─── Premium host: see who wishlisted your event ─────────────────────────────
DROP POLICY IF EXISTS "saved_select_host_premium" ON saved_events;
CREATE POLICY "saved_select_host_premium" ON saved_events
  FOR SELECT TO authenticated
  USING (
    user_is_premium(auth.uid())
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = saved_events.event_id AND e.host_id = auth.uid()
    )
  );

-- Every host gets the COUNT (for the locked teaser); only premium hosts get
-- the rows (policy above).
CREATE OR REPLACE FUNCTION count_event_savers(p_event_id UUID)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INT FROM saved_events s
  WHERE s.event_id = p_event_id
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = p_event_id AND e.host_id = auth.uid()
    );
$$;

-- ─── MAP: events_within_radius + host_verified ───────────────────────────────
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
  women_only        BOOLEAN,
  distance_m        FLOAT,
  participant_count INT,
  lat               FLOAT,
  lng               FLOAT,
  host_name         TEXT,
  host_photo_url    TEXT,
  host_verified     BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.host_id, e.activity, e.title, e.description, e.location_name,
    e.starts_at, e.ends_at, e.max_people, e.is_public, e.requires_approval,
    e.women_only,
    ST_Distance(e.location, ST_MakePoint(user_lng, user_lat)::geography) AS distance_m,
    COUNT(ep.user_id) FILTER (WHERE ep.status = 'approved')::INT AS participant_count,
    ST_Y(e.location::geometry) AS lat,
    ST_X(e.location::geometry) AS lng,
    p.name AS host_name,
    -- Prefer the gallery's first photo (the profile "main" photo); photo_url
    -- only exists on profiles created before the gallery.
    COALESCE(p.photos[1], p.photo_url) AS host_photo_url,
    (p.kyc_status = 'approved') AS host_verified
  FROM events e
  JOIN profiles p ON p.id = e.host_id
  LEFT JOIN event_participants ep ON ep.event_id = e.id
  WHERE
    e.is_active = TRUE
    AND e.is_public = TRUE
    AND ST_DWithin(e.location, ST_MakePoint(user_lng, user_lat)::geography, radius_m)
    AND (activity_filter IS NULL OR e.activity = activity_filter)
    AND (e.ends_at IS NULL OR e.ends_at > NOW())
    -- Female-only events are visible only to female profiles and the host.
    AND (
      e.women_only = FALSE
      OR e.host_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles me
        WHERE me.id = auth.uid() AND me.gender = 'female'
      )
    )
    -- Hide hosts in a block relationship with the viewer (either direction).
    AND NOT EXISTS (
      SELECT 1 FROM blocks bl
      WHERE (bl.blocker_id = auth.uid() AND bl.blocked_id = e.host_id)
         OR (bl.blocker_id = e.host_id AND bl.blocked_id = auth.uid())
    )
  GROUP BY e.id, p.name, p.photos, p.photo_url, p.kyc_status
  ORDER BY distance_m ASC;
END;
$$;

-- ─── EXPLORE: explore_feed + host_verified ───────────────────────────────────
DROP FUNCTION IF EXISTS explore_feed(UUID, FLOAT, FLOAT, activity_type, INT, INT);

CREATE FUNCTION explore_feed(
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
  host_verified     BOOLEAN,
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
  women_only        BOOLEAN,
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
  viewer_is_female BOOLEAN;
BEGIN
  SELECT p.interests, (p.gender = 'female')
    INTO viewer_interests, viewer_is_female
    FROM profiles p WHERE p.id = p_user_id;
  viewer_is_female := COALESCE(viewer_is_female, FALSE);

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
      e.is_public, e.requires_approval, e.women_only,
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
      -- Female-only events are visible only to female profiles and the host.
      AND (e.women_only = FALSE OR e.host_id = p_user_id OR viewer_is_female)
      -- Hide hosts in a block relationship with the viewer (either direction).
      AND NOT EXISTS (
        SELECT 1 FROM blocks bl
        WHERE (bl.blocker_id = p_user_id AND bl.blocked_id = e.host_id)
           OR (bl.blocker_id = e.host_id AND bl.blocked_id = p_user_id)
      )
    GROUP BY e.id
  )
  SELECT
    b.id, b.host_id, pr.name, pr.photo_url,
    (pr.kyc_status = 'approved') AS host_verified,
    b.activity, b.title, b.description,
    b.image_url, b.location_name, b.starts_at, b.ends_at, b.created_at,
    b.max_people, b.is_public, b.requires_approval, b.women_only,
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
