-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY CHECKS — run in the Supabase SQL editor. Read-only unless noted.
--
-- >> RUN ONE CHECK AT A TIME. <<
-- The SQL editor returns only the result of the LAST statement it executes, so
-- running this whole file shows you Check 2 and silently discards the rest.
-- Select the block you want and run the selection.
--
-- Written after `event_attendees_preview` shipped with an open `anon` grant:
-- `REVOKE ... FROM PUBLIC` looked correct and did nothing, because Supabase's
-- ALTER DEFAULT PRIVILEGES grants EXECUTE to `anon` *by name* and a named grant
-- is not touched by revoking from PUBLIC. Reviewing the migration could not
-- catch that. Querying the catalog can.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── CHECK 1 · Function grants and definer hardening ─────────────────────────
-- The whole audit in one query. Two columns decide whether a row is a problem:
--
--   anon_execute = true  AND  security_definer = true
--     A signed-out client can invoke code that runs with the owner's privileges
--     and bypasses RLS. This is the hole that shipped.
--
--   security_definer = true  AND  search_path_pinned = false
--     Anyone who can create objects in a schema on the caller's search_path can
--     shadow a name the body resolves and have it execute as the owner.
--
-- Expected after the fixes: `event_attendees_preview` shows f / t / t.
--
-- This variant returns ONLY the rows that need attention, so an empty result is
-- the all-clear. Drop the HAVING-style WHERE at the bottom to see everything.
SELECT
  p.proname AS function_name,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  (p.proconfig IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%'
     )) AS search_path_pinned,
  CASE
    WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
      THEN '!! anon can run a SECURITY DEFINER function'
    ELSE '!  definer without pinned search_path'
  END AS problem
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef                       -- SECURITY DEFINER only
  AND (
    has_function_privilege('anon', p.oid, 'EXECUTE')
    OR p.proconfig IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%'
    )
  )
ORDER BY has_function_privilege('anon', p.oid, 'EXECUTE') DESC, p.proname;


-- Full listing, if you want to see every function rather than just the
-- problems. Same columns, nothing filtered.
SELECT
  p.proname                                              AS function_name,
  has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
  p.prosecdef                                            AS security_definer,
  (p.proconfig IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search\_path=%'
     ))                                                  AS search_path_pinned,
  CASE
    WHEN p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
      THEN '!! anon can run a definer function'
    WHEN p.prosecdef AND p.proconfig IS NULL
      THEN '!  definer without pinned search_path'
    ELSE 'ok'
  END                                                    AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY
  (p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')) DESC,
  (p.prosecdef AND p.proconfig IS NULL) DESC,
  p.proname;


-- ─── CHECK 2 · Which tables are readable, and by whom ────────────────────────
-- RLS disabled on a table exposed through PostgREST means it is world-readable
-- to anyone holding the anon key — which ships inside the app binary.
-- Expect rls_enabled = true for every row.
SELECT
  c.relname                                        AS table_name,
  c.relrowsecurity                                 AS rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT')     AS anon_select,
  (SELECT count(*) FROM pg_policies pol
    WHERE pol.schemaname = 'public' AND pol.tablename = c.relname) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relrowsecurity ASC, anon_select DESC, c.relname;


-- ─── CHECK 3 · Behaviour: does the function actually gate correctly? ─────────
-- >> MOVED. Run `check3_attendee_preview_behaviour.sql` — paste it whole, read
-- >> the verdict column, nothing to fill in.
--
-- The blocks below are kept as documentation of the shape of the test. Do not
-- run them: they need three UUIDs you have to go and find, and the block cases
-- need an event that already has approved attendees, which this database does
-- not have. The moved version builds its own cast inside a subtransaction it
-- rolls back, so it proves the block branches without depending on your data.

-- 3a. A women-only event, viewed by a user who is not female and not the host.
--     EXPECTED: zero rows. Any row is a leak.
--
--     Find the ingredients:
--       SELECT id, title FROM events WHERE women_only = TRUE LIMIT 5;
--       SELECT id, name FROM profiles WHERE gender IS DISTINCT FROM 'female' LIMIT 5;
/*
BEGIN;
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', '<NON-FEMALE-USER-UUID>')::text,
                    true);
  SET LOCAL ROLE authenticated;
  SELECT * FROM event_attendees_preview(ARRAY['<WOMEN-ONLY-EVENT-UUID>']::uuid[]);
ROLLBACK;
*/

-- 3b. The same event viewed by a female user.
--     EXPECTED: one row. If this is also empty the gate is inverted and the
--     feature is broken rather than leaky — check both directions, because a
--     filter that blocks everyone passes a naive "no leak" test.
/*
BEGIN;
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', '<FEMALE-USER-UUID>')::text,
                    true);
  SET LOCAL ROLE authenticated;
  SELECT * FROM event_attendees_preview(ARRAY['<WOMEN-ONLY-EVENT-UUID>']::uuid[]);
ROLLBACK;
*/

-- 3c. Blocking. Creates a block, checks the blocked person vanishes from the
--     faces and the count, then rolls the block away.
--     EXPECTED: `before` contains the attendee, `after` does not, and
--     going_count drops by one.
--
--     Find an event with attendees:
--       SELECT ep.event_id, ep.user_id, e.title
--       FROM event_participants ep JOIN events e ON e.id = ep.event_id
--       WHERE ep.status = 'approved' LIMIT 10;
/*
BEGIN;
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', '<VIEWER-UUID>')::text,
                    true);

  SET LOCAL ROLE authenticated;
  SELECT 'before' AS phase, *
    FROM event_attendees_preview(ARRAY['<EVENT-UUID>']::uuid[]);

  RESET ROLE;
  INSERT INTO blocks (blocker_id, blocked_id)
  VALUES ('<VIEWER-UUID>', '<ATTENDEE-UUID>');

  SET LOCAL ROLE authenticated;
  SELECT 'after' AS phase, *
    FROM event_attendees_preview(ARRAY['<EVENT-UUID>']::uuid[]);
ROLLBACK;   -- the block never happened
*/

-- 3d. The reverse direction. Someone who blocked *you* must also disappear —
--     the predicate checks both, and this is the half people forget.
/*
BEGIN;
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', '<VIEWER-UUID>')::text, true);
  RESET ROLE;
  INSERT INTO blocks (blocker_id, blocked_id)
  VALUES ('<ATTENDEE-UUID>', '<VIEWER-UUID>');   -- note: reversed
  SET LOCAL ROLE authenticated;
  SELECT * FROM event_attendees_preview(ARRAY['<EVENT-UUID>']::uuid[]);
ROLLBACK;
*/


-- ─── CHECK 4 · Is participant_count actually being suppressed by RLS? ────────
-- The open question behind `going_count`. `explore_feed` is STABLE with no
-- SECURITY DEFINER, so it runs as the caller and RLS applies to the
-- event_participants join inside it — which would make every count read low for
-- anyone who is not the host.
--
-- Compare the truth against what a normal user sees. If column two is smaller
-- than column one, the suspicion is confirmed for that event.
/*
-- Truth, as owner (RLS bypassed):
SELECT event_id, count(*) AS real_approved
FROM event_participants
WHERE status = 'approved'
GROUP BY event_id
ORDER BY real_approved DESC
LIMIT 10;

-- What a non-host sees through the feed:
BEGIN;
  SELECT set_config('request.jwt.claims',
                    json_build_object('sub', '<NON-HOST-VIEWER-UUID>')::text,
                    true);
  SET LOCAL ROLE authenticated;
  SELECT id, title, participant_count
  FROM explore_feed('<NON-HOST-VIEWER-UUID>'::uuid, NULL, NULL, NULL, 20, 0);
ROLLBACK;
*/
