-- 029: Instagram-style usernames.
-- Every profile gets a unique, case-insensitive username (a-z, 0-9, '.', '_';
-- 3-30 chars; no leading/trailing dot, no '..'). Existing rows are backfilled
-- from the display name. Run this whole file in the Supabase SQL editor.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- Format rules (Postgres regex has no lookahead, so '..' is a separate check).
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE profiles ADD CONSTRAINT profiles_username_format CHECK (
  username IS NULL OR (
    username ~ '^[a-z0-9._]{3,30}$'
    AND username !~ '^\.'
    AND username !~ '\.$'
    AND username !~ '\.\.'
  )
);

-- Unique regardless of case (the app always lowercases, but belt-and-braces).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key
  ON profiles (lower(username));

-- Backfill existing profiles: slugify the display name, then add a numeric
-- suffix until unique. Names that slugify to nothing become 'mello<n>'.
DO $$
DECLARE
  rec RECORD;
  base TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR rec IN SELECT id, name FROM profiles WHERE username IS NULL LOOP
    base := lower(regexp_replace(coalesce(rec.name, ''), '[^a-zA-Z0-9._]', '', 'g'));
    base := regexp_replace(base, '\.{2,}', '.', 'g');
    base := trim(both '.' from base);
    IF length(base) < 3 THEN
      base := 'mello' || floor(random() * 9000 + 1000)::int;
    END IF;
    base := left(base, 24);

    candidate := base;
    n := 0;
    WHILE EXISTS (
      SELECT 1 FROM profiles WHERE lower(username) = lower(candidate)
    ) LOOP
      n := n + 1;
      candidate := base || n;
    END LOOP;

    UPDATE profiles SET username = candidate WHERE id = rec.id;
  END LOOP;
END $$;

ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;

-- Availability check used by onboarding (before the caller has a profile row)
-- and by the edit screen. SECURITY DEFINER so it also works while the profiles
-- SELECT policy is evaluated for a brand-new auth user.
CREATE OR REPLACE FUNCTION is_username_available(candidate TEXT)
RETURNS BOOLEAN AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM profiles WHERE lower(username) = lower(candidate)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION is_username_available(TEXT) TO authenticated;
