-- ─────────────────────────────────────────────────────────────────────────────
-- Add an optional gender to profiles. Constrained to a small set (NULL allowed
-- for existing rows / users who skip it). Run in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gender TEXT
  CHECK (gender IS NULL OR gender IN ('male', 'female', 'non-binary', 'other'));
