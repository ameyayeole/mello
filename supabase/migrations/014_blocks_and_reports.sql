-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCKS + REPORTS
--   blocks  — a user hides/severs ties with another user (one row per pair).
--   reports — a user flags another user for moderation.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── BLOCKS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)           -- can't block yourself
);

CREATE INDEX IF NOT EXISTS blocks_blocker_idx ON blocks (blocker_id);

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

-- A user only ever sees/manages the blocks they created.
DROP POLICY IF EXISTS "blocks_select" ON blocks;
CREATE POLICY "blocks_select" ON blocks
  FOR SELECT TO authenticated USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "blocks_insert" ON blocks;
CREATE POLICY "blocks_insert" ON blocks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "blocks_delete" ON blocks;
CREATE POLICY "blocks_delete" ON blocks
  FOR DELETE TO authenticated USING (blocker_id = auth.uid());

-- Blocking severs any friendship between the two users. The existing
-- on_friendship_deleted trigger keeps friends_count correct for both sides.
-- SECURITY DEFINER so it can delete the row regardless of which side is acting.
CREATE OR REPLACE FUNCTION on_block_created()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM friendships
  WHERE (requester_id = NEW.blocker_id AND addressee_id = NEW.blocked_id)
     OR (requester_id = NEW.blocked_id AND addressee_id = NEW.blocker_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_block_created ON blocks;
CREATE TRIGGER on_block_created
  AFTER INSERT ON blocks
  FOR EACH ROW EXECUTE FUNCTION on_block_created();

-- ─── REPORTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  details     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CHECK (reporter_id <> reported_id)
);

CREATE INDEX IF NOT EXISTS reports_reported_idx ON reports (reported_id);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- A user can file a report and see only their own. Moderation reads happen
-- out-of-band with the service role (which bypasses RLS).
DROP POLICY IF EXISTS "reports_select" ON reports;
CREATE POLICY "reports_select" ON reports
  FOR SELECT TO authenticated USING (reporter_id = auth.uid());

DROP POLICY IF EXISTS "reports_insert" ON reports;
CREATE POLICY "reports_insert" ON reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
