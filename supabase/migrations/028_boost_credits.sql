-- ─────────────────────────────────────────────────────────────────────────────
-- 028: BOOST CREDITS  (buy packs, spend from balance)
--   Boosts stop being a per-event purchase (026's model). Hosts now buy boost
--   PACKS as consumable IAPs — 1 boost ₹69 / 5 boosts ₹249 — which land as
--   profiles.boost_credits. "Boost event" on the host panel spends one credit
--   via the use_boost() RPC (24h hot window, same effects as 026).
--
--   • profiles.boost_credits — guarded like the premium columns: clients can't
--     write it; only verify-boost (service role) and use_boost() may.
--   • boost_purchases — one row per store transaction, PK txn_id, making the
--     credit grant idempotent when a finished transaction re-delivers.
--   • grant_boost_credits() — called by the verify-boost edge function after
--     store verification: inserts the purchase + increments credits atomically.
--   • use_boost(event_id) — spends 1 credit and sets boosted_until = now+24h.
--     SECURITY DEFINER; flips a transaction-local setting so the 026 guard
--     trigger (and the new credits guard) lets these specific writes through.
--   • events.boost_source gains a 'credit' value.
--
-- Run this whole file in the Supabase SQL editor (after 027).
--
-- To grant credits manually while IAP is stubbed:
--   UPDATE profiles SET boost_credits = boost_credits + 5 WHERE id = '<uuid>';
--   (run as postgres in the SQL editor — the guard only blocks signed-in users)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS boost_credits INT NOT NULL DEFAULT 0;

-- ─── Guard: clients can't mint their own credits ─────────────────────────────
CREATE OR REPLACE FUNCTION guard_boost_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NEW.boost_credits IS DISTINCT FROM OLD.boost_credits
     AND current_setting('app.boost_spend', TRUE) IS DISTINCT FROM 'on'
  THEN
    RAISE EXCEPTION 'boost credits can only be changed by the billing service';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_boost_credits ON profiles;
CREATE TRIGGER trg_guard_boost_credits
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION guard_boost_credits();

-- ─── 026 guard update: let use_boost() through ───────────────────────────────
-- Same body as 026 plus the transaction-local escape hatch that use_boost sets
-- right before it writes the boost columns.
CREATE OR REPLACE FUNCTION guard_boost_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND current_setting('app.boost_spend', TRUE) IS DISTINCT FROM 'on'
     AND (
       NEW.boosted_until IS DISTINCT FROM OLD.boosted_until
    OR NEW.boost_source  IS DISTINCT FROM OLD.boost_source
    OR NEW.boost_txn_id  IS DISTINCT FROM OLD.boost_txn_id
  ) THEN
    RAISE EXCEPTION 'boost columns can only be updated by the billing service';
  END IF;
  RETURN NEW;
END;
$$;

-- Boosts lit from a credit are 'credit'-sourced.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_boost_source_check;
ALTER TABLE events ADD CONSTRAINT events_boost_source_check
  CHECK (boost_source IN ('apple', 'google', 'manual', 'credit'));

-- ─── Purchase ledger (idempotency) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS boost_purchases (
  txn_id     TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  credits    INT  NOT NULL,
  platform   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service-role only; no client policies on purpose.
ALTER TABLE boost_purchases ENABLE ROW LEVEL SECURITY;

-- ─── grant_boost_credits: called by verify-boost after store verification ────
-- Returns TRUE when credits were granted, FALSE when this txn was already
-- processed (idempotent re-delivery).
CREATE OR REPLACE FUNCTION grant_boost_credits(
  p_user_id    UUID,
  p_txn_id     TEXT,
  p_product_id TEXT,
  p_platform   TEXT,
  p_credits    INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO boost_purchases (txn_id, user_id, product_id, platform, credits)
  VALUES (p_txn_id, p_user_id, p_product_id, p_platform, p_credits)
  ON CONFLICT (txn_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE profiles
    SET boost_credits = boost_credits + p_credits
    WHERE id = p_user_id;
  RETURN TRUE;
END;
$$;

-- Only the billing service may grant.
REVOKE EXECUTE ON FUNCTION grant_boost_credits(UUID, TEXT, TEXT, TEXT, INT)
  FROM PUBLIC, anon, authenticated;

-- ─── use_boost: spend 1 credit on your own event ─────────────────────────────
-- Returns the new boosted_until. Raises with a clear message when the caller
-- has no credits / doesn't host the event / the event is already boosted.
CREATE OR REPLACE FUNCTION use_boost(p_event_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user    UUID := auth.uid();
  v_credits INT;
  v_until   TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  -- Lock the profile row so two parallel spends can't share one credit.
  SELECT boost_credits INTO v_credits
    FROM profiles WHERE id = v_user FOR UPDATE;
  IF COALESCE(v_credits, 0) < 1 THEN
    RAISE EXCEPTION 'no_credits';
  END IF;

  PERFORM 1 FROM events
    WHERE id = p_event_id
      AND host_id = v_user
      AND is_active = TRUE
      AND (boosted_until IS NULL OR boosted_until < NOW())
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_boostable';
  END IF;

  v_until := NOW() + INTERVAL '24 hours';

  -- Transaction-local escape hatch for the two guard triggers above.
  PERFORM set_config('app.boost_spend', 'on', TRUE);
  UPDATE profiles SET boost_credits = boost_credits - 1 WHERE id = v_user;
  UPDATE events
    SET boosted_until = v_until,
        boost_source  = 'credit',
        boost_txn_id  = NULL
    WHERE id = p_event_id;

  RETURN v_until;
END;
$$;

GRANT EXECUTE ON FUNCTION use_boost(UUID) TO authenticated;
