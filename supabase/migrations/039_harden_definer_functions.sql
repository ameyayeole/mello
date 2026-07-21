-- ─────────────────────────────────────────────────────────────────────────────
-- HARDEN EVERY SECURITY DEFINER FUNCTION
-- Run this whole file in the Supabase SQL editor.
--
-- An audit of pg_proc turned up ~46 SECURITY DEFINER functions in `public`,
-- every one of them EXECUTE-able by `anon` and none of them pinning
-- search_path. Same root cause as `event_attendees_preview`: Supabase's
-- ALTER DEFAULT PRIVILEGES grants EXECUTE on new functions to `anon` by name,
-- and `GRANT ... TO authenticated` in a migration adds a grant without removing
-- that one.
--
-- WHAT WAS AND WASN'T EXPOSED
--
-- Probed with the app's own anon key, the callable ones answered HTTP 200 —
-- so the grant really was open. They did not leak, because their bodies guard:
-- `get_checkin_qr`, for instance, returns early unless auth.uid() equals the
-- event's host, and a NULL uid fails that test. The door was unlocked; the
-- safe inside it was not. This migration locks the door.
--
-- Two changes, applied by enumeration rather than by hand — 46 signatures typed
-- out is 46 chances to fat-finger one and silently miss it:
--
--   1. SET search_path = public, pg_temp   on every definer function.
--      Without it, anyone who can create an object in a schema on the caller's
--      search_path can shadow a name the body resolves and have it run with the
--      owner's privileges. This is pure hardening: no behaviour changes.
--
--   2. REVOKE EXECUTE FROM anon           on every callable definer function.
--      Safe because the app has no pre-auth surface at all: all 14 `.rpc(`
--      call sites sit behind one redirect in app/_layout.tsx — no session
--      sends you to /onboarding/welcome, which calls nothing.
--
--      Two look like exceptions and are not:
--        * `get_public_wrap` — "public" means visible to any signed-in user,
--          not unauthenticated. Its route (app/wrap/[eventId]) is outside
--          (tabs) but still under the root guard. The screen's own comment
--          says "reachable by anyone", which is what made this worth checking.
--        * `is_username_available` — called from a debounce effect, NOT from
--          the submit path, so the `session?.user` guard on submit does not
--          cover it. It is safe because you only reach profile-setup with a
--          session already in hand, and because the call site swallows errors:
--          a failure costs an availability hint, not a signup.
--
-- Extension-owned functions (PostGIS: st_estimatedextent and friends) are
-- skipped. They are not ours to alter, altering them breaks `pg_dump`
-- round-trips, and they are flagged by Supabase's advisor for everyone.
--
-- Trigger functions keep their grant. A trigger fires without checking the
-- invoking user's EXECUTE privilege, and PostgREST will not expose a function
-- returning `trigger`, so the grant is unreachable either way — revoking it
-- would be churn with a non-zero chance of breaking a trigger for no gain.
-- They still get search_path pinned, which is the part that matters for them.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  fn          RECORD;
  n_pinned    INT := 0;
  n_revoked   INT := 0;
BEGIN
  FOR fn IN
    SELECT
      p.oid,
      p.oid::regprocedure AS signature,
      p.prorettype = 'trigger'::regtype AS is_trigger
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      -- Not owned by an installed extension.
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid
          AND d.classid = 'pg_proc'::regclass
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = public, pg_temp', fn.signature
    );
    n_pinned := n_pinned + 1;

    IF NOT fn.is_trigger THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.signature);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon',   fn.signature);
      -- Re-grant: the blanket revoke above would otherwise also strip the
      -- access real users need.
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.signature
      );
      n_revoked := n_revoked + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'search_path pinned on %, anon revoked on % callable', n_pinned, n_revoked;
END;
$$;


-- ─── Verification ────────────────────────────────────────────────────────────
-- Left as the LAST statement on purpose: the SQL editor only shows the final
-- result set, so this is what you will actually see.
--
-- EXPECTED: zero rows. Any row is a definer function still reachable by anon or
-- still unpinned, excluding PostGIS's own.
--
-- "Pinned" means proconfig actually contains a `search_path=` entry, not merely
-- that proconfig is non-NULL. A function carrying some other setting — a
-- `SET statement_timeout`, say — has a non-NULL proconfig and no pinned
-- search_path, and the looser test would wave it through. The looser test is
-- what this file shipped with; it happened to give the right answer here
-- because the block above pins every function it visits.
SELECT
  p.oid::regprocedure::text AS still_a_problem,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  EXISTS (
    SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%'
  ) AS search_path_pinned,
  p.prorettype = 'trigger'::regtype AS is_trigger
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend d
    WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
  )
  AND (
    p.proconfig IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%'
    )
    OR (p.prorettype <> 'trigger'::regtype
        AND has_function_privilege('anon', p.oid, 'EXECUTE'))
  )
ORDER BY 1;
