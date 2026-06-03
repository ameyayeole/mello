-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: trigger functions must run as SECURITY DEFINER so they can write to
-- RLS-protected tables (notifications has no INSERT policy; friends_count
-- updates the OTHER user's profile). Without this, joining an event or
-- accepting a friend request fails. Run this on an existing database.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_events_hosted()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET events_hosted = events_hosted + 1
  WHERE id = NEW.host_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

CREATE OR REPLACE FUNCTION create_join_notification()
RETURNS TRIGGER AS $$
DECLARE
  event_host_id UUID;
  event_title   TEXT;
BEGIN
  SELECT host_id, title INTO event_host_id, event_title
  FROM events WHERE id = NEW.event_id;

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
