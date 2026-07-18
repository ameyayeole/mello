-- ─────────────────────────────────────────────────────────────────────────────
-- 025: MELLO+ STORE BILLING (Apple IAP / Google Play)
--   • profiles.premium_source / premium_txn_id — which store granted premium
--     and the original transaction id / purchase token, so the verify-iap
--     edge function can re-validate and renewals stay idempotent.
--   • guard trigger extended to the new columns: only the service role (the
--     verify-iap edge function / SQL editor) may write any premium state.
-- The 1-month free trial is an *introductory offer configured on the store
-- products* (App Store Connect / Play Console) — the store collects the
-- payment method and autopay mandate, then verify-iap records the resulting
-- subscription here exactly like a paid one (expiry = trial end).
-- Run this whole file in the Supabase SQL editor (after 024).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS premium_source TEXT
    CHECK (premium_source IN ('apple', 'google', 'manual')),
  ADD COLUMN IF NOT EXISTS premium_txn_id TEXT;

-- Replaces the 024 version, adding the two new columns to the protected set.
CREATE OR REPLACE FUNCTION guard_premium_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
       NEW.is_premium     IS DISTINCT FROM OLD.is_premium
    OR NEW.premium_until  IS DISTINCT FROM OLD.premium_until
    OR NEW.premium_plan   IS DISTINCT FROM OLD.premium_plan
    OR NEW.premium_source IS DISTINCT FROM OLD.premium_source
    OR NEW.premium_txn_id IS DISTINCT FROM OLD.premium_txn_id
  ) THEN
    RAISE EXCEPTION 'premium columns can only be updated by the billing service';
  END IF;
  RETURN NEW;
END;
$$;
