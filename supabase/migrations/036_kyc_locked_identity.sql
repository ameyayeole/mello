-- ─────────────────────────────────────────────────────────────────────────────
-- 036: Lock identity to the verified document. When a KYC session is approved
-- the didit-webhook writes the name, date of birth, age and gender read off the
-- government ID into the profile (see didit-webhook/index.ts). From that point
-- the user must not be able to change those fields to anything else — the badge
-- would then vouch for details that no longer match the document.
--
-- This adds date_of_birth (the document value; profiles already has name/age/
-- gender) and a guard trigger that rejects any client edit to those four fields
-- once kyc_status = 'approved'. The webhook writes with the service role, where
-- auth.uid() is NULL, so it is never blocked. Complements guard_kyc_columns
-- from migration 019, which locks the kyc_* columns themselves.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- ─── Guard: identity fields are immutable to the user once verified ──────────
CREATE OR REPLACE FUNCTION guard_kyc_locked_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND OLD.kyc_status = 'approved'
     AND (
          NEW.name          IS DISTINCT FROM OLD.name
       OR NEW.age           IS DISTINCT FROM OLD.age
       OR NEW.gender        IS DISTINCT FROM OLD.gender
       OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
     ) THEN
    RAISE EXCEPTION 'name, age, gender and date of birth are locked to your verified ID';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_kyc_locked_identity ON profiles;
CREATE TRIGGER trg_guard_kyc_locked_identity
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_kyc_locked_identity();
