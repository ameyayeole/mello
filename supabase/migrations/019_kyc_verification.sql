-- ─────────────────────────────────────────────────────────────────────────────
-- 019: KYC identity verification via Didit. Adds kyc_* columns to profiles,
-- a trigger that stops users from verifying themselves (profiles_update RLS
-- lets a user update their own row; the Didit webhook edge function writes
-- with the service role, where auth.uid() is NULL), and an event-id table so
-- webhook deliveries are idempotent.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'none'
    CHECK (kyc_status IN ('none', 'in_progress', 'pending_review', 'approved', 'declined', 'expired')),
  ADD COLUMN IF NOT EXISTS kyc_session_id UUID,
  ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;

-- ─── Guard: only the service role may change KYC state ───────────────────────
CREATE OR REPLACE FUNCTION guard_kyc_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND (
       NEW.kyc_status      IS DISTINCT FROM OLD.kyc_status
    OR NEW.kyc_session_id  IS DISTINCT FROM OLD.kyc_session_id
    OR NEW.kyc_verified_at IS DISTINCT FROM OLD.kyc_verified_at
  ) THEN
    RAISE EXCEPTION 'kyc columns can only be updated by the verification service';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_kyc_columns ON profiles;
CREATE TRIGGER trg_guard_kyc_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_kyc_columns();

-- ─── Webhook idempotency: one row per processed Didit event ──────────────────
CREATE TABLE IF NOT EXISTS kyc_webhook_events (
  event_id    TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service-role only: RLS on with no policies denies all client access.
ALTER TABLE kyc_webhook_events ENABLE ROW LEVEL SECURITY;
