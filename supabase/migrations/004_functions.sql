-- ─── NEARBY EVENTS (core PostGIS query) ──────────────────────────────────────
-- Called from the app via supabase.rpc('events_within_radius', {...})
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
    e.id,
    e.host_id,
    e.activity,
    e.title,
    e.description,
    e.location_name,
    e.starts_at,
    e.ends_at,
    e.max_people,
    e.is_public,
    ST_Distance(e.location, ST_MakePoint(user_lng, user_lat)::geography) AS distance_m,
    COUNT(ep.user_id)::INT AS participant_count,
    ST_Y(e.location::geometry) AS lat,
    ST_X(e.location::geometry) AS lng
  FROM events e
  LEFT JOIN event_participants ep ON ep.event_id = e.id
  WHERE
    e.is_active = TRUE
    AND e.is_public = TRUE
    AND ST_DWithin(
      e.location,
      ST_MakePoint(user_lng, user_lat)::geography,
      radius_m
    )
    AND (activity_filter IS NULL OR e.activity = activity_filter)
    AND (e.ends_at IS NULL OR e.ends_at > NOW())
  GROUP BY e.id
  ORDER BY distance_m ASC;
END;
$$;

-- ─── INCREMENT events_hosted ON HOST PROFILE ─────────────────────────────────
CREATE OR REPLACE FUNCTION increment_events_hosted()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET events_hosted = events_hosted + 1
  WHERE id = NEW.host_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_event_created
  AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION increment_events_hosted();

-- ─── UPDATE friends_count WHEN FRIENDSHIP ACCEPTED ───────────────────────────
CREATE OR REPLACE FUNCTION update_friends_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    UPDATE profiles SET friends_count = friends_count + 1
    WHERE id IN (NEW.requester_id, NEW.addressee_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_friendship_accepted
  AFTER UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION update_friends_count();

-- ─── INSERT SYSTEM MESSAGE WHEN USER JOINS EVENT ─────────────────────────────
CREATE OR REPLACE FUNCTION insert_join_system_message()
RETURNS TRIGGER AS $$
DECLARE
  user_name TEXT;
BEGIN
  SELECT name INTO user_name FROM profiles WHERE id = NEW.user_id;
  INSERT INTO messages (event_id, sender_id, content, type)
  VALUES (NEW.event_id, NEW.user_id, user_name || ' joined the event', 'system');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_participant_joined
  AFTER INSERT ON event_participants
  FOR EACH ROW EXECUTE FUNCTION insert_join_system_message();

-- ─── SEND PUSH NOTIFICATION TRIGGER (calls Edge Function) ───────────────────
-- Notifications are sent from the Edge Function; this trigger creates the
-- in-app notification record only.

CREATE OR REPLACE FUNCTION create_join_notification()
RETURNS TRIGGER AS $$
DECLARE
  event_host_id UUID;
  event_title   TEXT;
BEGIN
  SELECT host_id, title INTO event_host_id, event_title
  FROM events WHERE id = NEW.event_id;

  -- Don't notify if the host joins their own event
  IF event_host_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
  VALUES (
    event_host_id,
    NEW.user_id,
    'join_request',
    NEW.event_id,
    jsonb_build_object('eventTitle', event_title)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_participant_joined_notify
  AFTER INSERT ON event_participants
  FOR EACH ROW EXECUTE FUNCTION create_join_notification();

-- ─── MARK events IS_ACTIVE = FALSE WHEN PAST END TIME ──────────────────────
CREATE OR REPLACE FUNCTION cleanup_expired_events()
RETURNS void AS $$
BEGIN
  UPDATE events
  SET is_active = FALSE
  WHERE is_active = TRUE
    AND ends_at IS NOT NULL
    AND ends_at < NOW() - INTERVAL '2 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
