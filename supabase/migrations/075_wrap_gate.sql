-- ─────────────────────────────────────────────────────────────────────────────
-- WRAP GATE. Everything the client cannot work out for itself: how many people
-- finished the contribution flow, how many are needed, who they were, and how
-- long ago the event ended. Counting other people's completion is impossible
-- client-side under RLS, which is the whole reason this function exists.
--
-- The threshold lives HERE and only here. If the client also computed it, two
-- app versions could disagree about whether a wrap is unlocked.
--
--   S = everyone at the event, host included
--   N = LEAST(S, GREATEST(2, LEAST(5, CEIL(S/2.0))))
--
-- Floor 2 so one person can never unlock a group artifact alone; cap 5 so a
-- 40-person event is not impossible; LEAST(S, ...) so the floor can never ask
-- for more people than exist. Run this whole file in the SQL editor.
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

GRANT EXECUTE ON FUNCTION get_wrap_gate(UUID, UUID) TO authenticated;
