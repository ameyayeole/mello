-- ─────────────────────────────────────────────────────────────────────────────
-- 026: BOOST YOUR EVENT  (₹69, 24 hours "hot")
--   • events.boosted_until / boost_source / boost_txn_id — set only by the
--     verify-boost edge function (Apple/Google consumable IAP) or the SQL
--     editor, exactly like the premium columns in 024/025.
--   • guard trigger: hosts own their event rows, so without this anyone could
--     flip their own boosted_until from the client — block it.
--   • event_is_boosted() helper.
--   • events_within_radius / explore_feed gain an is_boosted flag and rank
--     boosted events first (return shape changes → DROP first, like 024).
--   • explore_feed gains p_boosted_only for the Explore "🔥 Hot" tab.
--   • notify-on-boost: when an event goes hot, everyone who wishlisted it gets
--     an 'event_boosted' notification (reuses the 021 push fan-out trigger).
-- Run this whole file in the Supabase SQL editor (after 025).
--
-- To boost an event manually while IAP is stubbed (runs as postgres, so the
-- guard trigger allows it):
--   UPDATE events SET boosted_until = NOW() + INTERVAL '24 hours',
--     boost_source = 'manual' WHERE id = '<event-uuid>';
-- ─────────────────────────────────────────────────────────────────────────────

-- New notification type for "an event you saved just got boosted". Enum values
-- must be added before anything uses them; this runs first in the file.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'event_boosted';

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS boosted_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS boost_source  TEXT
    CHECK (boost_source IN ('apple', 'google', 'manual')),
  ADD COLUMN IF NOT EXISTS boost_txn_id  TEXT;

-- ─── Guard: only the service role may change boost state ─────────────────────
CREATE OR REPLACE FUNCTION guard_boost_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
       NEW.boosted_until IS DISTINCT FROM OLD.boosted_until
    OR NEW.boost_source  IS DISTINCT FROM OLD.boost_source
    OR NEW.boost_txn_id  IS DISTINCT FROM OLD.boost_txn_id
  ) THEN
    RAISE EXCEPTION 'boost columns can only be updated by the billing service';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_boost_columns ON events;
CREATE TRIGGER trg_guard_boost_columns
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION guard_boost_columns();

-- ─── Helper: is this event boosted right now? ────────────────────────────────
CREATE OR REPLACE FUNCTION event_is_boosted(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (SELECT e.boosted_until > NOW() FROM events e WHERE e.id = p_event_id),
    FALSE
  );
$$;

-- ─── Notify wishlisters when an event goes hot ───────────────────────────────
-- Fires only on the transition into "boosted" (null/past → future), so a host
-- editing an already-boosted event never re-notifies. The insert into
-- notifications reuses the 021 push fan-out trigger automatically.
CREATE OR REPLACE FUNCTION on_event_boosted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.boosted_until IS NOT NULL
     AND NEW.boosted_until > NOW()
     AND (OLD.boosted_until IS NULL OR OLD.boosted_until <= NOW())
  THEN
    INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
    SELECT s.user_id, NEW.host_id, 'event_boosted', NEW.id,
           jsonb_build_object('eventTitle', NEW.title)
    FROM saved_events s
    WHERE s.event_id = NEW.id
      AND s.user_id <> NEW.host_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_event_boosted ON events;
CREATE TRIGGER on_event_boosted
  AFTER UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION on_event_boosted();

-- ─── MAP: events_within_radius + is_boosted (boosted pins first) ─────────────
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
  host_verified     BOOLEAN,
  is_boosted        BOOLEAN
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
    COALESCE(p.photos[1], p.photo_url) AS host_photo_url,
    (p.kyc_status = 'approved') AS host_verified,
    (e.boosted_until IS NOT NULL AND e.boosted_until > NOW()) AS is_boosted
  FROM events e
  JOIN profiles p ON p.id = e.host_id
  LEFT JOIN event_participants ep ON ep.event_id = e.id
  WHERE
    e.is_active = TRUE
    AND e.is_public = TRUE
    AND ST_DWithin(e.location, ST_MakePoint(user_lng, user_lat)::geography, radius_m)
    AND (activity_filter IS NULL OR e.activity = activity_filter)
    AND (e.ends_at IS NULL OR e.ends_at > NOW())
    AND (
      e.women_only = FALSE
      OR e.host_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles me
        WHERE me.id = auth.uid() AND me.gender = 'female'
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM blocks bl
      WHERE (bl.blocker_id = auth.uid() AND bl.blocked_id = e.host_id)
         OR (bl.blocker_id = e.host_id AND bl.blocked_id = auth.uid())
    )
  GROUP BY e.id, p.name, p.photos, p.photo_url, p.kyc_status
  -- Boosted events first, then nearest.
  ORDER BY (e.boosted_until IS NOT NULL AND e.boosted_until > NOW()) DESC, distance_m ASC;
END;
$$;

-- ─── EXPLORE: explore_feed + is_boosted + p_boosted_only ─────────────────────
DROP FUNCTION IF EXISTS explore_feed(UUID, FLOAT, FLOAT, activity_type, INT, INT);

CREATE FUNCTION explore_feed(
  p_user_id        UUID,
  user_lat         FLOAT DEFAULT NULL,
  user_lng         FLOAT DEFAULT NULL,
  activity_filter  activity_type DEFAULT NULL,
  p_limit          INT DEFAULT 10,
  p_offset         INT DEFAULT 0,
  p_boosted_only   BOOLEAN DEFAULT FALSE
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
  is_boosted        BOOLEAN,
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
      (e.boosted_until IS NOT NULL AND e.boosted_until > NOW()) AS is_boosted,
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
      -- "🔥 Hot" tab: only currently-boosted events.
      AND (NOT p_boosted_only OR (e.boosted_until IS NOT NULL AND e.boosted_until > NOW()))
      AND (e.women_only = FALSE OR e.host_id = p_user_id OR viewer_is_female)
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
    b.dist_m, b.p_count, b.f_count, b.e_lat, b.e_lng, b.is_boosted,
    (
      -- Boosted events float above the organic score for their 24h window.
      CASE WHEN b.is_boosted THEN 1000.0 ELSE 0 END
      + 10.0 * ln(1 + b.p_count)
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
