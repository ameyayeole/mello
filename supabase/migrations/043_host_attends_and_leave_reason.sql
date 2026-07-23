-- ─────────────────────────────────────────────────────────────────────────────
-- 043: THE HOST IS AN ATTENDEE, + WHY PEOPLE LEAVE
-- Run this whole file in the Supabase SQL editor, AFTER 042.
--
-- Two changes:
--
--   a. The host counts as going. Until now a brand-new event read "0/x going"
--      because the host was never an event_participants row — only guests were.
--      Every count and every "who's going" avatar stack in the app is derived
--      from approved participant rows, so the fix is one place: make the host an
--      approved participant. A trigger does it for new events; a backfill does it
--      for the ones already created. participant_count then reads >= 1 everywhere
--      with no client change.
--
--   b. Leaving records a reason. leaveEvent DELETEs the participant row, so a
--      reason cannot live on that row — it goes in its own table, readable by the
--      person who left and by the event's host (so a host can see why guests
--      dropped).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── a. HOST AS APPROVED PARTICIPANT ───────────────────────────────────────────
-- SECURITY DEFINER so the insert is not subject to the caller's RLS (it inserts a
-- row for host_id, which the caller — also the host at creation time — could do
-- anyway, but a definer trigger keeps this true regardless of who inserts the
-- event). search_path pinned per migration 039.
CREATE OR REPLACE FUNCTION add_host_as_participant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO event_participants (event_id, user_id, status)
  VALUES (NEW.id, NEW.host_id, 'approved')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_host_as_participant ON events;
CREATE TRIGGER trg_add_host_as_participant
  AFTER INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION add_host_as_participant();

-- Backfill every event that already exists. ON CONFLICT DO NOTHING makes this
-- safe to re-run and a no-op for events whose host somehow already has a row.
INSERT INTO event_participants (event_id, user_id, status)
SELECT id, host_id, 'approved' FROM events
ON CONFLICT DO NOTHING;

-- ── b. LEAVE FEEDBACK ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_leave_feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason     TEXT NOT NULL,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A host reads this per event; index the lookup.
CREATE INDEX IF NOT EXISTS idx_leave_feedback_event
  ON event_leave_feedback (event_id);

ALTER TABLE event_leave_feedback ENABLE ROW LEVEL SECURITY;

-- The person leaving writes (and can read back) their own rows.
DROP POLICY IF EXISTS "leave_feedback_insert" ON event_leave_feedback;
CREATE POLICY "leave_feedback_insert" ON event_leave_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Visible to the author, and to the host of the event it concerns.
DROP POLICY IF EXISTS "leave_feedback_select" ON event_leave_feedback;
CREATE POLICY "leave_feedback_select" ON event_leave_feedback
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR event_id IN (SELECT id FROM events WHERE host_id = auth.uid())
  );
