-- ─────────────────────────────────────────────────────────────────────────────
-- SWIPE DECK + WISHLIST
-- Backs the Tinder-style event deck opened from the map's peek cards.
--   • event_swipes: one row per user/event swipe ('like' or 'pass') so an event
--     the user has already judged never reappears in their deck.
--   • saved_events: the wishlist (bookmark button on the deck + profile
--     section). The client service functions for this table already existed;
--     this migration finally creates it.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_swipes (
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id   UUID NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
  direction  TEXT NOT NULL CHECK (direction IN ('like', 'pass')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id)
);

CREATE TABLE IF NOT EXISTS saved_events (
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id   UUID NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_id)
);

-- A saved_events table already existed in some environments (an older, minimal
-- shape), so the CREATE above may have been skipped — patch the columns the
-- wishlist reads. Existing rows get NOW(), which is close enough for ordering.
ALTER TABLE saved_events
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE event_swipes
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE event_swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_events ENABLE ROW LEVEL SECURITY;

-- Users only ever see and manage their own swipes / saves.
DROP POLICY IF EXISTS "swipes_select_own" ON event_swipes;
DROP POLICY IF EXISTS "swipes_insert_own" ON event_swipes;
DROP POLICY IF EXISTS "swipes_update_own" ON event_swipes;
DROP POLICY IF EXISTS "swipes_delete_own" ON event_swipes;

CREATE POLICY "swipes_select_own" ON event_swipes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "swipes_insert_own" ON event_swipes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "swipes_update_own" ON event_swipes
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "swipes_delete_own" ON event_swipes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "saved_select_own" ON saved_events;
DROP POLICY IF EXISTS "saved_insert_own" ON saved_events;
DROP POLICY IF EXISTS "saved_delete_own" ON saved_events;

CREATE POLICY "saved_select_own" ON saved_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "saved_insert_own" ON saved_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "saved_delete_own" ON saved_events
  FOR DELETE TO authenticated USING (user_id = auth.uid());
