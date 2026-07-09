-- ─────────────────────────────────────────────────────────────────────────────
-- THUMBS: a user can give another user a "thumbs up" endorsement (one per pair,
-- toggleable). profiles.thumbs_count is a denormalized total kept by triggers.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Table
CREATE TABLE IF NOT EXISTS thumbs (
  giver_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (giver_id, receiver_id),
  CHECK (giver_id <> receiver_id)            -- can't thumbs yourself
);

CREATE INDEX IF NOT EXISTS thumbs_receiver_idx ON thumbs (receiver_id);

ALTER TABLE thumbs ENABLE ROW LEVEL SECURITY;

-- 2. Denormalized count on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS thumbs_count INT DEFAULT 0;

-- 3. RLS: everyone authenticated can read thumbs (to show counts / whether they
-- already thumbed someone); a user may only add/remove their OWN thumb.
DROP POLICY IF EXISTS "thumbs_select" ON thumbs;
CREATE POLICY "thumbs_select" ON thumbs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "thumbs_insert" ON thumbs;
CREATE POLICY "thumbs_insert" ON thumbs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = giver_id);

DROP POLICY IF EXISTS "thumbs_delete" ON thumbs;
CREATE POLICY "thumbs_delete" ON thumbs
  FOR DELETE TO authenticated USING (auth.uid() = giver_id);

-- 4. Keep thumbs_count in sync on insert / delete.
CREATE OR REPLACE FUNCTION bump_thumbs_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET thumbs_count = thumbs_count + 1
    WHERE id = NEW.receiver_id;
    RETURN NEW;
  ELSE
    UPDATE profiles SET thumbs_count = GREATEST(thumbs_count - 1, 0)
    WHERE id = OLD.receiver_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_thumb_added ON thumbs;
CREATE TRIGGER on_thumb_added
  AFTER INSERT ON thumbs
  FOR EACH ROW EXECUTE FUNCTION bump_thumbs_count();

DROP TRIGGER IF EXISTS on_thumb_removed ON thumbs;
CREATE TRIGGER on_thumb_removed
  AFTER DELETE ON thumbs
  FOR EACH ROW EXECUTE FUNCTION bump_thumbs_count();

-- 5. Backfill from any existing rows.
UPDATE profiles p SET thumbs_count = sub.cnt
FROM (
  SELECT receiver_id, COUNT(*)::INT AS cnt FROM thumbs GROUP BY receiver_id
) sub
WHERE p.id = sub.receiver_id;
