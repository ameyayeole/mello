-- 042: The rest of the system messages a chat needs — hosting and leaving.
-- Joining has posted one since 004; these are the two that never did, so a
-- brand-new chat read as empty and someone leaving happened silently.
-- Requires 007. Run this whole file in the Supabase SQL editor.

-- ─── "X is hosting this event" ───────────────────────────────────────────────
-- The first line in every chat, written when the event is created, so a chat
-- nobody has posted in still opens with something true in it rather than a
-- blank page.
CREATE OR REPLACE FUNCTION on_event_created_system_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  host_name TEXT;
BEGIN
  SELECT name INTO host_name FROM profiles WHERE id = NEW.host_id;
  INSERT INTO messages (event_id, sender_id, content, type)
  VALUES (
    NEW.id,
    NEW.host_id,
    COALESCE(host_name, 'The host') || ' is hosting this event',
    'system'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_event_created_system_message ON events;
CREATE TRIGGER on_event_created_system_message
  AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION on_event_created_system_message();

-- ─── "X left the event" ──────────────────────────────────────────────────────
-- Fires on the participant row going away, which covers both someone leaving
-- and a host removing them. `sender_id` is the person who left — the row is
-- theirs, and attributing it to the host would be wrong in the common case.
--
-- OLD.status is checked because a pending request that is declined was never
-- in the chat to leave it, and announcing that to everyone would leak that
-- they ever asked.
CREATE OR REPLACE FUNCTION on_participant_left_system_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_name TEXT;
BEGIN
  IF OLD.status <> 'approved' THEN
    RETURN OLD;
  END IF;

  -- Nothing to post into if the event itself is being deleted; the cascade
  -- would drop the message with it anyway.
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = OLD.event_id) THEN
    RETURN OLD;
  END IF;

  SELECT name INTO user_name FROM profiles WHERE id = OLD.user_id;
  INSERT INTO messages (event_id, sender_id, content, type)
  VALUES (
    OLD.event_id,
    OLD.user_id,
    COALESCE(user_name, 'Someone') || ' left the event',
    'system'
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_participant_left_system_message ON event_participants;
CREATE TRIGGER on_participant_left_system_message
  AFTER DELETE ON event_participants
  FOR EACH ROW EXECUTE FUNCTION on_participant_left_system_message();
