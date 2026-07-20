-- ─────────────────────────────────────────────────────────────────────────────
-- 037: GREETING LINES — fun, quirky one-liners the home header rotates through
-- (alongside the time-of-day greeting) every 18 seconds. Edit/add/deactivate
-- rows here to change what the app shows; no app release needed.
-- Run this whole file in the Supabase SQL editor. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Table
CREATE TABLE IF NOT EXISTS greeting_lines (
  id         SERIAL PRIMARY KEY,
  text       TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE greeting_lines ENABLE ROW LEVEL SECURITY;

-- 2. RLS: any signed-in user can read active lines; writes only via the
-- dashboard / service role (no INSERT/UPDATE/DELETE policies on purpose).
DROP POLICY IF EXISTS "greeting_lines_select" ON greeting_lines;
CREATE POLICY "greeting_lines_select" ON greeting_lines
  FOR SELECT TO authenticated USING (is_active);

-- 3. Seed: 12 quirky lines. ON CONFLICT keeps re-runs idempotent.
INSERT INTO greeting_lines (text, sort_order) VALUES
  ('What''s happening tonight?',      1),
  ('Host your own thing',             2),
  ('Your city''s wide awake',         3),
  ('Plans don''t make themselves',    4),
  ('Go on, be spontaneous',           5),
  ('Someone fun is nearby',           6),
  ('Say yes to something',            7),
  ('Main character energy',           8),
  ('New faces, good vibes',           9),
  ('Tonight could be a story',        10),
  ('Who are you meeting today?',      11),
  ('Small plans, big memories',       12)
ON CONFLICT (text) DO NOTHING;
