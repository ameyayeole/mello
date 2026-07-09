-- ─────────────────────────────────────────────────────────────────────────────
-- Profile gallery (up to 6 photos) + an events_attended counter.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. New columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS events_attended INT DEFAULT 0;

-- Cap the gallery at 6 photos (NULL / empty arrays are allowed).
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_photos_max;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_photos_max
  CHECK (photos IS NULL OR COALESCE(array_length(photos, 1), 0) <= 6);

-- 2. events_attended: bumped when a user becomes an APPROVED participant of an
-- event they do NOT host (hosting is already tracked by events_hosted). Covers
-- both a direct approved join (INSERT) and a host approving a pending request
-- (UPDATE pending -> approved).
CREATE OR REPLACE FUNCTION bump_events_attended()
RETURNS TRIGGER AS $$
DECLARE
  event_host_id UUID;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NOT (OLD.status = 'pending' AND NEW.status = 'approved') THEN
    RETURN NEW;
  END IF;

  SELECT host_id INTO event_host_id FROM events WHERE id = NEW.event_id;
  IF event_host_id IS DISTINCT FROM NEW.user_id THEN
    UPDATE profiles SET events_attended = events_attended + 1
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_participant_attended_insert ON event_participants;
CREATE TRIGGER on_participant_attended_insert
  AFTER INSERT ON event_participants
  FOR EACH ROW EXECUTE FUNCTION bump_events_attended();

DROP TRIGGER IF EXISTS on_participant_attended_update ON event_participants;
CREATE TRIGGER on_participant_attended_update
  AFTER UPDATE ON event_participants
  FOR EACH ROW EXECUTE FUNCTION bump_events_attended();

-- 3. Backfill the counter from existing approved attendances.
UPDATE profiles p SET events_attended = sub.cnt
FROM (
  SELECT ep.user_id, COUNT(*)::INT AS cnt
  FROM event_participants ep
  JOIN events e ON e.id = ep.event_id
  WHERE ep.status = 'approved' AND e.host_id <> ep.user_id
  GROUP BY ep.user_id
) sub
WHERE p.id = sub.user_id;
