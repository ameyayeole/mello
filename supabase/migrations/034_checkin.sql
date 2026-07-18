-- ─────────────────────────────────────────────────────────────────────────────
-- 034: EVENT CHECK-IN (host shows one QR, attendees scan to check themselves in)
-- Model:
--   • Each event has ONE secret checkin_token (+ a typo-friendly 6-char code).
--     Only the host can read it (get_checkin_qr). Displaying it is proof of
--     "you're physically at the door".
--   • An approved attendee scans the host's QR and calls check_in_self, which
--     stamps only their own participant row. One token per event, one self-write
--     per arrival — no per-attendee ticket rows.
--   • Rotating the token (get_checkin_qr with p_rotate) invalidates old
--     screenshots.
-- Run this whole file in the Supabase SQL editor, AFTER 033.
-- ─────────────────────────────────────────────────────────────────────────────

-- The host's door secret lives on the event. NULL until the host first opens
-- the check-in screen (minted lazily by get_checkin_qr). Never selected by the
-- app's SELECT * paths for non-hosts — reads go through the host-only RPC.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS checkin_token UUID,
  ADD COLUMN IF NOT EXISTS checkin_code  TEXT;

-- Who's arrived, visible wherever participant rows are (host sees all; a guest
-- sees their own). checked_in_by is the guest themselves in this model.
ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES profiles(id);

-- ── HOST: THE DOOR QR ─────────────────────────────────────────────────────────
-- Mints (or rotates) and returns this event's check-in secret. Host only.
-- The 6-char code skips lookalikes (I/L/O/0/1) for read-aloud legibility.
CREATE OR REPLACE FUNCTION get_checkin_qr(p_event_id UUID, p_rotate BOOLEAN DEFAULT FALSE)
RETURNS TABLE (token UUID, code TEXT) AS $$
DECLARE
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code TEXT;
BEGIN
  IF auth.uid() IS DISTINCT FROM (SELECT host_id FROM events WHERE id = p_event_id) THEN
    RETURN;
  END IF;

  IF p_rotate OR (SELECT checkin_token FROM events WHERE id = p_event_id) IS NULL THEN
    v_code := (
      SELECT string_agg(
        substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::INT, 1), ''
      ) FROM generate_series(1, 6)
    );
    UPDATE events
    SET checkin_token = gen_random_uuid(), checkin_code = v_code
    WHERE id = p_event_id;
  END IF;

  RETURN QUERY
  SELECT e.checkin_token, e.checkin_code FROM events e WHERE e.id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_checkin_qr(UUID, BOOLEAN) TO authenticated;

-- ── ATTENDEE: CHECK MYSELF IN ─────────────────────────────────────────────────
-- Pass the scanned token (p_token) OR the typed code (p_code). Caller must be an
-- approved attendee of the event and the secret must match.
-- status: ok | already | bad_secret | not_approved
CREATE OR REPLACE FUNCTION check_in_self(
  p_event_id UUID,
  p_token    UUID DEFAULT NULL,
  p_code     TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_row    event_participants%ROWTYPE;
  v_token  UUID;
  v_code   TEXT;
  v_title  TEXT;
BEGIN
  SELECT checkin_token, checkin_code, title INTO v_token, v_code, v_title
  FROM events WHERE id = p_event_id;

  IF v_token IS NULL
     OR NOT ((p_token IS NOT NULL AND p_token = v_token)
          OR (p_code  IS NOT NULL AND upper(trim(p_code)) = v_code)) THEN
    RETURN jsonb_build_object('status', 'bad_secret');
  END IF;

  SELECT * INTO v_row FROM event_participants
  WHERE event_id = p_event_id AND user_id = auth.uid();

  IF v_row.user_id IS NULL OR v_row.status <> 'approved' THEN
    RETURN jsonb_build_object('status', 'not_approved');
  END IF;

  IF v_row.checked_in_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already', 'title', v_title, 'checked_in_at', v_row.checked_in_at
    );
  END IF;

  UPDATE event_participants
  SET checked_in_at = NOW(), checked_in_by = auth.uid()
  WHERE event_id = p_event_id AND user_id = auth.uid();

  RETURN jsonb_build_object('status', 'ok', 'title', v_title, 'checked_in_at', NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_in_self(UUID, UUID, TEXT) TO authenticated;
