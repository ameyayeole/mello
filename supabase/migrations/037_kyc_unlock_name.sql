-- ─────────────────────────────────────────────────────────────────────────────
-- 037: Unlock display name after KYC. Migration 036 locked name/age/gender/
-- date_of_birth once kyc_status = 'approved'. Product decision: the display
-- name should stay freely editable after verification (people go by names
-- that don't match their government ID) — only age, gender and date_of_birth
-- remain locked, since those back the actual trust claim of the badge.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION guard_kyc_locked_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND OLD.kyc_status = 'approved'
     AND (
          NEW.age           IS DISTINCT FROM OLD.age
       OR NEW.gender        IS DISTINCT FROM OLD.gender
       OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
     ) THEN
    RAISE EXCEPTION 'age, gender and date of birth are locked to your verified ID';
  END IF;
  RETURN NEW;
END;
$$;
