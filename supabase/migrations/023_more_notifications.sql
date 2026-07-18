-- ─────────────────────────────────────────────────────────────────────────────
-- ACTIVATE THE REMAINING NOTIFICATION TYPES
--   • new_message          — event chat + direct messages
--   • event_update         — host edits an event
--   • friend_joined_event  — a friend joins an event you're already in
--   • event_starting_soon  — reminder ~30 min before start (pg_cron)
-- All four enum values already exist (migration 002). Run this whole file in
-- the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── NEW MESSAGE: event chat ─────────────────────────────────────────────────
-- Notify every approved participant and the host (except the sender) when a
-- real message (not a 'system' join line) is posted in an event chat.
CREATE OR REPLACE FUNCTION on_event_message()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'system' THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
  SELECT DISTINCT r.uid, NEW.sender_id, 'new_message', NEW.event_id,
         jsonb_build_object('kind', 'event_message', 'eventTitle', ev.title)
  FROM events ev
  JOIN LATERAL (
    SELECT ep.user_id AS uid
      FROM event_participants ep
      WHERE ep.event_id = NEW.event_id AND ep.status = 'approved'
    UNION
    SELECT ev.host_id
  ) r ON TRUE
  WHERE ev.id = NEW.event_id
    AND r.uid <> NEW.sender_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_event_message ON messages;
CREATE TRIGGER on_event_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION on_event_message();

-- ── NEW MESSAGE: direct message ─────────────────────────────────────────────
-- friendId in the payload is the sender, so tapping opens the DM thread.
CREATE OR REPLACE FUNCTION on_direct_message()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
  VALUES (NEW.recipient_id, NEW.sender_id, 'new_message', NULL,
          jsonb_build_object('kind', 'dm', 'friendId', NEW.sender_id));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_direct_message ON direct_messages;
CREATE TRIGGER on_direct_message
  AFTER INSERT ON direct_messages
  FOR EACH ROW EXECUTE FUNCTION on_direct_message();

-- ── EVENT UPDATED ───────────────────────────────────────────────────────────
-- Fire only when the host changes something attendees care about (not on
-- is_active flips from the cleanup job, nor on the starting_soon flag below).
CREATE OR REPLACE FUNCTION on_event_updated()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.title         IS DISTINCT FROM OLD.title
     OR NEW.description   IS DISTINCT FROM OLD.description
     OR NEW.starts_at     IS DISTINCT FROM OLD.starts_at
     OR NEW.ends_at       IS DISTINCT FROM OLD.ends_at
     OR NEW.location_name IS DISTINCT FROM OLD.location_name
     OR NEW.location      IS DISTINCT FROM OLD.location
     OR NEW.activity      IS DISTINCT FROM OLD.activity
  THEN
    INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
    SELECT DISTINCT ep.user_id, NEW.host_id, 'event_update', NEW.id,
           jsonb_build_object('eventTitle', NEW.title)
    FROM event_participants ep
    WHERE ep.event_id = NEW.id
      AND ep.status = 'approved'
      AND ep.user_id <> NEW.host_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_event_updated ON events;
CREATE TRIGGER on_event_updated
  AFTER UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION on_event_updated();

-- ── FRIEND JOINED AN EVENT YOU'RE IN ────────────────────────────────────────
-- When a user becomes an approved participant, tell any of their accepted
-- friends who are already approved participants of the same event.
CREATE OR REPLACE FUNCTION notify_friends_of_join(p_event_id UUID, p_user_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
  SELECT
    CASE WHEN f.requester_id = p_user_id THEN f.addressee_id ELSE f.requester_id END,
    p_user_id,
    'friend_joined_event',
    p_event_id,
    jsonb_build_object('eventTitle', (SELECT title FROM events WHERE id = p_event_id))
  FROM friendships f
  WHERE f.status = 'accepted'
    AND (f.requester_id = p_user_id OR f.addressee_id = p_user_id)
    AND EXISTS (
      SELECT 1 FROM event_participants ep
      WHERE ep.event_id = p_event_id
        AND ep.status = 'approved'
        AND ep.user_id =
          CASE WHEN f.requester_id = p_user_id THEN f.addressee_id ELSE f.requester_id END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Direct join (row inserted already approved).
CREATE OR REPLACE FUNCTION on_participant_insert_friends()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    PERFORM notify_friends_of_join(NEW.event_id, NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_participant_insert_friends ON event_participants;
CREATE TRIGGER on_participant_insert_friends
  AFTER INSERT ON event_participants
  FOR EACH ROW EXECUTE FUNCTION on_participant_insert_friends();

-- Approval (pending → approved).
CREATE OR REPLACE FUNCTION on_participant_approved_friends()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'approved' THEN
    PERFORM notify_friends_of_join(NEW.event_id, NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_participant_approved_friends ON event_participants;
CREATE TRIGGER on_participant_approved_friends
  AFTER UPDATE ON event_participants
  FOR EACH ROW EXECUTE FUNCTION on_participant_approved_friends();

-- ── EVENT STARTING SOON (pg_cron) ───────────────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS starting_soon_notified BOOLEAN DEFAULT FALSE;

-- Notify approved participants + host once, ~30 min before an event starts.
CREATE OR REPLACE FUNCTION notify_events_starting_soon()
RETURNS void AS $$
DECLARE
  due_ids UUID[];
BEGIN
  SELECT array_agg(id) INTO due_ids
  FROM events
  WHERE is_active = TRUE
    AND starting_soon_notified = FALSE
    AND starts_at > NOW()
    AND starts_at <= NOW() + INTERVAL '30 minutes';

  IF due_ids IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
  SELECT DISTINCT r.uid, NULL, 'event_starting_soon', ev.id,
         jsonb_build_object('eventTitle', ev.title)
  FROM events ev
  JOIN LATERAL (
    SELECT ep.user_id AS uid
      FROM event_participants ep
      WHERE ep.event_id = ev.id AND ep.status = 'approved'
    UNION
    SELECT ev.host_id
  ) r ON TRUE
  WHERE ev.id = ANY(due_ids);

  UPDATE events SET starting_soon_notified = TRUE WHERE id = ANY(due_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule it every 5 minutes. pg_cron is available on Supabase; enabling the
-- extension and (re)registering the job are both idempotent.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('event-starting-soon');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'event-starting-soon',
  '*/5 * * * *',
  $$SELECT notify_events_starting_soon()$$
);
