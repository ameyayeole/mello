-- ─────────────────────────────────────────────────────────────────────────────
-- HOST APPROVAL: events can require the host to approve join requests.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. New columns
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;

ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved'
  CHECK (status IN ('pending', 'approved'));

-- 2. New notification type for "your request was approved"
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'join_approved';

-- 3. RLS: the host may update participant rows (to approve them)
DROP POLICY IF EXISTS "participants_update_host" ON event_participants;
CREATE POLICY "participants_update_host" ON event_participants
  FOR UPDATE TO authenticated
  USING (event_id IN (SELECT id FROM events WHERE host_id = auth.uid()));

-- Host may also delete participant rows (reject a request / remove someone)
DROP POLICY IF EXISTS "participants_delete_host" ON event_participants;
CREATE POLICY "participants_delete_host" ON event_participants
  FOR DELETE TO authenticated
  USING (event_id IN (SELECT id FROM events WHERE host_id = auth.uid()));

-- 4. Replace the INSERT trigger: behaviour now depends on status
DROP TRIGGER IF EXISTS on_participant_joined ON event_participants;
DROP TRIGGER IF EXISTS on_participant_joined_notify ON event_participants;

CREATE OR REPLACE FUNCTION on_participant_insert()
RETURNS TRIGGER AS $$
DECLARE
  event_host_id UUID;
  event_title   TEXT;
  user_name     TEXT;
BEGIN
  SELECT host_id, title INTO event_host_id, event_title
  FROM events WHERE id = NEW.event_id;
  SELECT name INTO user_name FROM profiles WHERE id = NEW.user_id;

  IF NEW.status = 'approved' THEN
    -- Direct join: post a system message in the chat...
    INSERT INTO messages (event_id, sender_id, content, type)
    VALUES (NEW.event_id, NEW.user_id, user_name || ' joined the event', 'system');
    -- ...and notify the host (unless they joined their own event).
    IF event_host_id <> NEW.user_id THEN
      INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
      VALUES (event_host_id, NEW.user_id, 'join_request', NEW.event_id,
              jsonb_build_object('eventTitle', event_title, 'pending', false));
    END IF;
  ELSE
    -- Pending request: notify the host that someone wants to join.
    INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
    VALUES (event_host_id, NEW.user_id, 'join_request', NEW.event_id,
            jsonb_build_object('eventTitle', event_title, 'pending', true));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_participant_insert
  AFTER INSERT ON event_participants
  FOR EACH ROW EXECUTE FUNCTION on_participant_insert();

-- 5. New trigger: when a pending request is approved
CREATE OR REPLACE FUNCTION on_participant_approved()
RETURNS TRIGGER AS $$
DECLARE
  event_title TEXT;
  user_name   TEXT;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'approved' THEN
    SELECT title INTO event_title FROM events WHERE id = NEW.event_id;
    SELECT name INTO user_name FROM profiles WHERE id = NEW.user_id;

    -- System message in the event chat
    INSERT INTO messages (event_id, sender_id, content, type)
    VALUES (NEW.event_id, NEW.user_id, user_name || ' joined the event', 'system');

    -- Notify the requester they're in
    INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
    VALUES (NEW.user_id, NULL, 'join_approved', NEW.event_id,
            jsonb_build_object('eventTitle', event_title));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_participant_approved ON event_participants;
CREATE TRIGGER on_participant_approved
  AFTER UPDATE ON event_participants
  FOR EACH ROW EXECUTE FUNCTION on_participant_approved();

-- 6. events_within_radius: count only APPROVED participants, expose requires_approval
-- Must DROP first because the return type (columns) changed.
DROP FUNCTION IF EXISTS events_within_radius(FLOAT, FLOAT, FLOAT, activity_type);
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
  GROUP BY e.id
  ORDER BY distance_m ASC;
END;
$$;
