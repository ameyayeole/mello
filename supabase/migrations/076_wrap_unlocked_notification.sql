-- ─────────────────────────────────────────────────────────────────────────────
-- WRAP UNLOCKED. Fires once per event, the moment the contributor count first
-- reaches the threshold, to the people who contributed.
--
-- Only contributors: for everyone else the recap is still locked (their own
-- steps are unfinished), so "the wrap is open" would be a lie. The Home card
-- and the chat pin are what nag a non-contributor.
--
-- Guarded by a once-only column in the same shape as wrap_ready_notified (032).
-- Run this whole file in the Supabase SQL editor. If the editor rejects the
-- ALTER TYPE inside its transaction block, run that first line on its own and
-- then the rest.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'wrap_unlocked';

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS wrap_unlocked_notified BOOLEAN DEFAULT FALSE;

CREATE OR REPLACE FUNCTION notify_wrap_unlocked()
RETURNS TRIGGER AS $$
DECLARE
  v_size    INT;
  v_needed  INT;
  v_count   INT;
  v_flagged BOOLEAN;
BEGIN
  -- Cheap unlocked path first: once the event has fired, every later
  -- contribution costs one indexed read and nothing else.
  SELECT e.wrap_unlocked_notified INTO v_flagged
    FROM events e WHERE e.id = NEW.event_id;
  IF v_flagged THEN RETURN NULL; END IF;

  -- Same size and threshold arithmetic as get_wrap_gate (075). Duplicated
  -- deliberately: a trigger cannot call a RETURNS TABLE function cheaply, and
  -- the alternative is a SECURITY DEFINER round trip per contribution.
  -- If the formula in 075 changes, change it HERE TOO — nothing will error.
  SELECT 1 + (
    SELECT COUNT(*) FROM event_participants ep
     WHERE ep.event_id = e.id
       AND ep.status   = 'approved'
       AND ep.user_id <> e.host_id
  ) INTO v_size
    FROM events e WHERE e.id = NEW.event_id;

  v_needed := LEAST(v_size, GREATEST(2, LEAST(5, CEIL(v_size / 2.0)::INT)));

  SELECT COUNT(*) INTO v_count
    FROM wrap_contributions wc WHERE wc.event_id = NEW.event_id;

  IF v_count < v_needed THEN RETURN NULL; END IF;

  -- Claim the flag atomically rather than re-reading it. Two people finishing
  -- the flow at the same instant would both pass the check above; the row lock
  -- this takes means exactly one of them proceeds to the INSERT. Without it the
  -- duplicate notifications would be rare, silent, and impossible to reproduce.
  UPDATE events
     SET wrap_unlocked_notified = TRUE
   WHERE id = NEW.event_id
     AND wrap_unlocked_notified = FALSE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Column list copied from the wrap_ready sender in 032_wrap.sql — the
  -- notifications table is (recipient_id, sender_id, type, event_id, payload).
  -- The eventTitle payload is what notificationCopy renders the title from.
  INSERT INTO notifications (recipient_id, sender_id, type, event_id, payload)
  SELECT wc.user_id, NULL, 'wrap_unlocked', NEW.event_id,
         jsonb_build_object('eventTitle', ev.title)
    FROM wrap_contributions wc
    JOIN events ev ON ev.id = wc.event_id
   WHERE wc.event_id = NEW.event_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS wrap_contributions_unlock ON wrap_contributions;
CREATE TRIGGER wrap_contributions_unlock
  AFTER INSERT ON wrap_contributions
  FOR EACH ROW EXECUTE FUNCTION notify_wrap_unlocked();
