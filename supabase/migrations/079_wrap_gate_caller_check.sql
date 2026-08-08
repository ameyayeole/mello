-- ─────────────────────────────────────────────────────────────────────────────
-- WRAP GATE — check the CALLER, not just the claimed user.
--
-- 075 shipped a hole. Its guard was:
--
--     IF NOT is_event_attendee(p_event_id, p_user_id) THEN RAISE ...
--
-- which asks "did the user in this argument attend?" — never "is the caller
-- that user?". p_user_id is supplied by whoever calls. On top of that, Postgres
-- grants EXECUTE on new functions to PUBLIC by default, and 075 only added a
-- GRANT without a matching REVOKE, so `anon` could call it too.
--
-- Together that meant anyone holding the publicly-shipped anon key could pass any
-- (event_id, user_id) pair and read back the contributor list — ids, names and
-- avatar URLs — for any event that user attended. Confirmed with a plain curl
-- against /rest/v1/rpc/get_wrap_gate on 2026-08-08.
--
-- Two fixes, both needed:
--   1. assert auth.uid() = p_user_id, so you may only ask about yourself;
--   2. REVOKE from PUBLIC/anon so an unauthenticated caller cannot reach it.
--
-- The client already passes the logged-in user's own id (wrap.service.ts), so
-- nothing in the app changes.
--
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_wrap_gate(p_event_id UUID, p_user_id UUID)
RETURNS TABLE (
  contributor_count   BIGINT,
  contributors_needed INT,
  contributors        JSONB,
  hours_since_end     INT
) AS $$
DECLARE
  v_size INT;
BEGIN
  -- You may only ask about yourself. Without this, p_user_id is an unverified
  -- claim and SECURITY DEFINER turns it into a lookup oracle.
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'get_wrap_gate may only be called for the authenticated user';
  END IF;

  -- SECURITY DEFINER bypasses RLS, so membership must be re-asserted here.
  IF NOT is_event_attendee(p_event_id, p_user_id) THEN
    RAISE EXCEPTION 'not an attendee of this event';
  END IF;

  -- Host, plus every approved participant who is not the host.
  SELECT 1 + (
    SELECT COUNT(*) FROM event_participants ep
     WHERE ep.event_id = e.id
       AND ep.status   = 'approved'
       AND ep.user_id <> e.host_id
  )
    INTO v_size
    FROM events e
   WHERE e.id = p_event_id;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM wrap_contributions wc WHERE wc.event_id = p_event_id),
    LEAST(v_size, GREATEST(2, LEAST(5, CEIL(v_size / 2.0)::INT)))::INT,
    COALESCE((
      SELECT jsonb_agg(t ORDER BY t.created_at)
        FROM (
          SELECT pr.id, pr.name, pr.photo_url, wc.created_at
            FROM wrap_contributions wc
            JOIN profiles pr ON pr.id = wc.user_id
           WHERE wc.event_id = p_event_id
        ) t
    ), '[]'::jsonb),
    EXTRACT(EPOCH FROM (NOW() - wrap_end_at(p_event_id)))::INT / 3600;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Postgres grants EXECUTE to PUBLIC on every new function. 075 granted to
-- authenticated but never revoked that default, which is how anon got in.
REVOKE ALL ON FUNCTION get_wrap_gate(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_wrap_gate(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION get_wrap_gate(UUID, UUID) TO authenticated;
