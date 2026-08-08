-- ─────────────────────────────────────────────────────────────────────────────
-- WRAP CONTRIBUTIONS. One row per person who finished the contribution flow for
-- an event. The wrap's recap unlocks on a count of these rows (see 075), so this
-- is a deliberate marker written once at the end of the flow — not a derived
-- count over ratings/photos/votes, which would be expensive and would drift.
-- Readable by anyone who attended: the contributor list is the incentive to
-- contribute. Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wrap_contributions (
  event_id   UUID NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS wrap_contributions_event_idx
  ON wrap_contributions (event_id);

ALTER TABLE wrap_contributions ENABLE ROW LEVEL SECURITY;

-- Everyone who came can see who contributed.
DROP POLICY IF EXISTS "wrap_contributions_select" ON wrap_contributions;
CREATE POLICY "wrap_contributions_select" ON wrap_contributions
  FOR SELECT TO authenticated
  USING (is_event_attendee(event_id, auth.uid()));

-- You may only mark yourself, only if you attended, and only inside the
-- existing 7-day wrap window (wrap_window_open — unchanged by this work).
DROP POLICY IF EXISTS "wrap_contributions_insert" ON wrap_contributions;
CREATE POLICY "wrap_contributions_insert" ON wrap_contributions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_event_attendee(event_id, auth.uid())
    AND wrap_window_open(event_id)
  );
