-- ─────────────────────────────────────────────────────────────────────────────
-- ATTENDEE PREVIEWS: the faces on an event card.
-- Run this whole file in the Supabase SQL editor.
--
-- WHY A FUNCTION AND NOT AN RLS POLICY
--
-- The obvious fix for "cards can't show who's going" is to loosen
-- `participants_select` so any authenticated user can read participants of any
-- event they can see. Do not do that. An RLS policy grants access to the
-- *table*, and PostgREST exposes tables directly — so that one line would also
-- hand every client:
--
--   * every column, including `status`. Pending join requests are private
--     between the requester and the host; a policy scoped to "events you can
--     see" leaks who has been rejected or is waiting.
--   * arbitrary filtering. `?select=*&user_id=eq.<uuid>` enumerates every event
--     a named person is attending, with times and locations via a join. For an
--     app that ships an SOS button and a "share your plan" safety flow, that is
--     the exact query we must not answer.
--   * unbounded pagination over the whole table.
--
-- This is the same reason consumer social apps don't expose their follow graph
-- as a queryable table: the client talks to purpose-built endpoints that return
-- the few fields a specific piece of UI needs, and authorisation is decided
-- server-side per request. `SECURITY DEFINER` is Postgres's version of that.
-- The table stays deny-by-default; this function is the only door, it returns
-- three columns, it caps how many rows it will ever hand back, and it re-checks
-- visibility itself rather than trusting the caller.
--
-- Hardening notes, both load-bearing:
--   * `SET search_path` is mandatory on a definer function. Without it, anyone
--     able to create objects in a schema on the caller's search_path can shadow
--     a name this body resolves and have it run with the owner's privileges.
--   * EXECUTE is revoked from PUBLIC (which includes `anon`) and granted only
--     to `authenticated`, so a signed-out client cannot call it at all.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS event_attendees_preview(UUID[], INT);

CREATE FUNCTION event_attendees_preview(
  p_event_ids UUID[],
  p_limit     INT DEFAULT 3
)
RETURNS TABLE (
  event_id    UUID,
  attendees   JSONB,
  going_count INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH
  -- Caps, applied to the caller's arguments rather than trusted from them.
  -- Without these the function is an enumeration endpoint wearing a preview's
  -- clothes.
  args AS (
    SELECT
      LEAST(GREATEST(COALESCE(p_limit, 3), 0), 10) AS face_limit,
      (SELECT ARRAY(SELECT DISTINCT unnest(p_event_ids) LIMIT 100)) AS ids
  ),
  -- Events this caller is actually allowed to see. Re-derived here, not
  -- inherited: the function bypasses RLS, so every predicate the feed applies
  -- has to be applied again or this becomes a way to read the attendees of
  -- events you were never shown.
  visible AS (
    SELECT e.id, e.host_id
    FROM events e, args
    WHERE e.id = ANY(args.ids)
      -- Fail closed with no caller identity.
      --
      -- Every other predicate here compares against auth.uid(), and NULL
      -- comparisons are not false, they are NULL — so a call with no JWT would
      -- silently skip the block filters (NOT EXISTS over an empty set is TRUE)
      -- and return attendees unfiltered. EXECUTE is already revoked from
      -- PUBLIC, so `anon` cannot reach this; the guard is here because the
      -- function must not depend on the grant being the only thing standing
      -- between it and an unauthenticated caller.
      AND auth.uid() IS NOT NULL
      AND e.is_active = TRUE
      AND e.is_public = TRUE
      -- Women-only events stay gated to women and the host.
      AND (
        e.women_only = FALSE
        OR e.host_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles me
          WHERE me.id = auth.uid() AND me.gender = 'female'
        )
      )
      -- Blocked in either direction: the event is invisible, so are its guests.
      AND NOT EXISTS (
        SELECT 1 FROM blocks bl
        WHERE (bl.blocker_id = auth.uid() AND bl.blocked_id = e.host_id)
           OR (bl.blocker_id = e.host_id AND bl.blocked_id = auth.uid())
      )
  ),
  -- Approved only. A pending request is between the requester and the host and
  -- must never appear in a public face pile.
  approved AS (
    SELECT
      ep.event_id,
      pr.id,
      pr.name,
      pr.photo_url,
      ROW_NUMBER() OVER (
        PARTITION BY ep.event_id ORDER BY ep.joined_at, pr.id
      ) AS rn,
      COUNT(*) OVER (PARTITION BY ep.event_id) AS total
    FROM event_participants ep
    JOIN visible v  ON v.id = ep.event_id
    JOIN profiles pr ON pr.id = ep.user_id
    WHERE ep.status = 'approved'
      -- Someone you've blocked, or who blocked you, is not shown to you.
      AND NOT EXISTS (
        SELECT 1 FROM blocks bl
        WHERE (bl.blocker_id = auth.uid() AND bl.blocked_id = pr.id)
           OR (bl.blocker_id = pr.id AND bl.blocked_id = auth.uid())
      )
  )
  SELECT
    v.id AS event_id,
    COALESCE(
      jsonb_agg(
        jsonb_build_object('id', a.id, 'name', a.name, 'photo_url', a.photo_url)
        ORDER BY a.rn
      ) FILTER (WHERE a.rn <= (SELECT face_limit FROM args)),
      '[]'::jsonb
    ) AS attendees,
    -- The true total, which is the point: read through RLS from the client this
    -- count collapses to "just me", because `participants_select` only exposes
    -- your own rows.
    --
    -- Note it is computed *after* the block filter, so it is the count as this
    -- viewer may see it, not the global one. That is the right call for a
    -- blocked-user feature — a blocked person should be absent, not merely
    -- faceless — but it does mean the number can differ between two viewers of
    -- the same event.
    COALESCE(MAX(a.total), 0)::INT AS going_count
  FROM visible v
  LEFT JOIN approved a ON a.event_id = v.id
  GROUP BY v.id;
$$;

-- Revoking from PUBLIC is NOT enough on Supabase, and this was verified the
-- hard way: with only the PUBLIC revoke in place, an anon client still got
-- HTTP 200 from this function.
--
-- Supabase provisions the database with
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
-- so every new function is granted to `anon` *explicitly, by name*. A grant
-- held directly by a role is not touched by revoking from PUBLIC — PUBLIC is a
-- separate grantee, not a group `anon` inherits from. The named revoke below is
-- the one that actually closes the door.
--
-- The `auth.uid() IS NOT NULL` guard in the body is the second layer, and it is
-- what kept this from leaking while the grant was still open. Keep both: the
-- grant is the door, the guard is the lock.
REVOKE ALL ON FUNCTION event_attendees_preview(UUID[], INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION event_attendees_preview(UUID[], INT) FROM anon;
GRANT EXECUTE ON FUNCTION event_attendees_preview(UUID[], INT) TO authenticated;
