-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 3 · Does `event_attendees_preview` return the RIGHT ROWS?
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor and hit run.
-- Nothing to fill in. Read the `verdict` column — every row must say PASS.
--
-- LAST RUN: 2026-07-21 against production — 8/8 PASS.
-- Re-run it after any change to `event_attendees_preview`, to the block rules,
-- or to who may see a women-only event.
--
-- IT WRITES NOTHING. All the test data is created inside a PL/pgSQL block that
-- ends in `RAISE EXCEPTION`, and a caught exception rolls back every database
-- change made inside its block. Local variables are not transactional, so the
-- results survive the rollback and get returned. That is the whole trick, and
-- it is why this can safely be run against production.
--
-- WHY THIS CHECK EXISTS
--
-- Checks 1 and 2 prove who may *call* the function. They cannot prove it
-- returns the right rows. `event_attendees_preview` is SECURITY DEFINER, so it
-- bypasses RLS entirely and re-implements six access rules by hand — the
-- women-only gate, blocks in both directions on the host, blocks in both
-- directions on each attendee, approved-only, and the no-identity guard. A typo
-- in any one of those predicates leaks real user data and nothing in `tsc`,
-- `eslint`, or the catalog queries in `security_checks.sql` would notice.
--
-- Both directions are tested on purpose. A filter that hides everyone from
-- everyone passes a naive "no leak" test while being completely broken, so
-- every negative case here has a positive case next to it.
--
-- WHY IT DOESN'T `SET ROLE authenticated`
--
-- It doesn't need to. The role only decides whether you may EXECUTE the
-- function — which Check 1 already covers — and a SECURITY DEFINER body runs as
-- the owner either way. What actually drives all six predicates is `auth.uid()`,
-- which reads the `request.jwt.claims` setting. So impersonation here means
-- setting that claim, and that is exactly what the real API does.
--
-- It borrows the four oldest profiles in your database as the cast. It only
-- reads their ids; the gender it sets on two of them is rolled back with
-- everything else.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.check3()
RETURNS TABLE (step TEXT, expected TEXT, actual TEXT, verdict TEXT)
LANGUAGE plpgsql
AS $fn$
DECLARE
  ids        UUID[];
  v_host     UUID;   -- hosts both test events
  v_attendee UUID;   -- the approved attendee, the person who must appear
  v_female   UUID;   -- viewer, gender female
  v_male     UUID;   -- viewer, gender male
  ev_women   UUID;   -- women_only = TRUE
  ev_open    UUID;   -- women_only = FALSE
  r          JSONB := '[]'::JSONB;
  n_rows     INT;
  n_going    INT;
  n_faces    INT;
BEGIN
  SELECT array_agg(id) INTO ids
  FROM (SELECT id FROM profiles ORDER BY created_at LIMIT 4) s;

  IF COALESCE(array_length(ids, 1), 0) < 4 THEN
    RETURN QUERY SELECT
      'setup'::TEXT,
      'at least 4 profiles to cast'::TEXT,
      format('found %s', COALESCE(array_length(ids, 1), 0))::TEXT,
      'CANNOT RUN'::TEXT;
    RETURN;
  END IF;

  v_host := ids[1]; v_attendee := ids[2]; v_female := ids[3]; v_male := ids[4];

  -- Everything from here to the RAISE EXCEPTION is undone.
  BEGIN
    -- Some INSERT triggers on events/participants read auth.uid() to attribute
    -- the actor, so give them a caller before writing anything.
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_host)::TEXT, TRUE);

    UPDATE profiles SET gender = 'female' WHERE id = v_female;
    UPDATE profiles SET gender = 'male'   WHERE id = v_male;

    INSERT INTO events (host_id, activity, title, location, starts_at,
                        is_public, is_active, women_only)
    VALUES (v_host, 'coffee', 'CHECK3 women-only',
            ST_SetSRID(ST_MakePoint(0, 0), 4326)::GEOGRAPHY,
            NOW() + INTERVAL '1 day', TRUE, TRUE, TRUE)
    RETURNING id INTO ev_women;

    INSERT INTO events (host_id, activity, title, location, starts_at,
                        is_public, is_active, women_only)
    VALUES (v_host, 'coffee', 'CHECK3 open',
            ST_SetSRID(ST_MakePoint(0, 0), 4326)::GEOGRAPHY,
            NOW() + INTERVAL '1 day', TRUE, TRUE, FALSE)
    RETURNING id INTO ev_open;

    INSERT INTO event_participants (event_id, user_id, status) VALUES
      (ev_women, v_attendee, 'approved'),
      (ev_open,  v_attendee, 'approved'),
      -- A pending request. It must never surface: who has asked to join is
      -- private between the requester and the host.
      (ev_open,  v_male,     'pending');

    -- ── 3a · women-only event, viewed by a man who is not the host ──────────
    -- The leak case. Any row here is the gate failing open.
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_male)::TEXT, TRUE);
    SELECT count(*) INTO n_rows FROM event_attendees_preview(ARRAY[ev_women]);
    r := r || jsonb_build_object(
      'step', '3a · women-only event, male viewer',
      'expected', '0 rows',
      'actual', n_rows || ' rows',
      'verdict', CASE WHEN n_rows = 0 THEN 'PASS' ELSE 'FAIL — LEAK' END);

    -- ── 3b · the same event, viewed by a woman ──────────────────────────────
    -- The other direction. If this is also empty the gate is inverted: not
    -- leaky, just broken, and 3a passed for the wrong reason.
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', v_female)::TEXT, TRUE);
    SELECT going_count, jsonb_array_length(attendees) INTO n_going, n_faces
    FROM event_attendees_preview(ARRAY[ev_women]);
    r := r || jsonb_build_object(
      'step', '3b · women-only event, female viewer',
      'expected', '1 going, 1 face',
      'actual', format('%s going, %s faces',
                       COALESCE(n_going::TEXT, 'no row'),
                       COALESCE(n_faces::TEXT, '-')),
      'verdict', CASE WHEN n_going = 1 AND n_faces = 1
                      THEN 'PASS' ELSE 'FAIL — gate inverted' END);

    -- ── 3c · pending requests stay private ──────────────────────────────────
    -- v_male has a pending row on the open event. The count must still be 1.
    SELECT going_count, jsonb_array_length(attendees) INTO n_going, n_faces
    FROM event_attendees_preview(ARRAY[ev_open]);
    r := r || jsonb_build_object(
      'step', '3c · pending request excluded',
      'expected', '1 going, 1 face (2 participant rows, 1 approved)',
      'actual', format('%s going, %s faces',
                       COALESCE(n_going::TEXT, 'no row'),
                       COALESCE(n_faces::TEXT, '-')),
      'verdict', CASE WHEN n_going = 1 AND n_faces = 1
                      THEN 'PASS' ELSE 'FAIL — pending is visible' END);

    -- ── 3d · you blocked the attendee ───────────────────────────────────────
    INSERT INTO blocks (blocker_id, blocked_id) VALUES (v_female, v_attendee);
    SELECT going_count, jsonb_array_length(attendees) INTO n_going, n_faces
    FROM event_attendees_preview(ARRAY[ev_open]);
    r := r || jsonb_build_object(
      'step', '3d · viewer blocked the attendee',
      'expected', 'row present, 0 going, 0 faces',
      'actual', format('%s going, %s faces',
                       COALESCE(n_going::TEXT, 'no row'),
                       COALESCE(n_faces::TEXT, '-')),
      'verdict', CASE WHEN n_going = 0 AND n_faces = 0
                      THEN 'PASS' ELSE 'FAIL — blocked user visible' END);
    DELETE FROM blocks WHERE blocker_id = v_female AND blocked_id = v_attendee;

    -- ── 3e · the attendee blocked you ───────────────────────────────────────
    -- The half people forget. The predicate checks both directions; this is the
    -- only thing that proves the second half was actually written.
    INSERT INTO blocks (blocker_id, blocked_id) VALUES (v_attendee, v_female);
    SELECT going_count, jsonb_array_length(attendees) INTO n_going, n_faces
    FROM event_attendees_preview(ARRAY[ev_open]);
    r := r || jsonb_build_object(
      'step', '3e · attendee blocked the viewer (reverse)',
      'expected', 'row present, 0 going, 0 faces',
      'actual', format('%s going, %s faces',
                       COALESCE(n_going::TEXT, 'no row'),
                       COALESCE(n_faces::TEXT, '-')),
      'verdict', CASE WHEN n_going = 0 AND n_faces = 0
                      THEN 'PASS' ELSE 'FAIL — reverse block not applied' END);
    DELETE FROM blocks WHERE blocker_id = v_attendee AND blocked_id = v_female;

    -- ── 3f · you blocked the host ───────────────────────────────────────────
    -- A blocked host's event is invisible, so its guest list must be too — not
    -- an empty row, no row at all.
    INSERT INTO blocks (blocker_id, blocked_id) VALUES (v_female, v_host);
    SELECT count(*) INTO n_rows FROM event_attendees_preview(ARRAY[ev_open]);
    r := r || jsonb_build_object(
      'step', '3f · viewer blocked the host',
      'expected', '0 rows',
      'actual', n_rows || ' rows',
      'verdict', CASE WHEN n_rows = 0 THEN 'PASS' ELSE 'FAIL — LEAK' END);
    DELETE FROM blocks WHERE blocker_id = v_female AND blocked_id = v_host;

    -- ── 3g · sanity: an ordinary viewer still sees the event ────────────────
    -- With every block removed, 3d–3f must not have passed by accident.
    SELECT going_count INTO n_going
    FROM event_attendees_preview(ARRAY[ev_open]);
    r := r || jsonb_build_object(
      'step', '3g · no blocks, ordinary viewer',
      'expected', '1 going',
      'actual', COALESCE(n_going::TEXT, 'no row') || ' going',
      'verdict', CASE WHEN n_going = 1
                      THEN 'PASS' ELSE 'FAIL — earlier passes were false' END);

    -- ── 3h · no caller identity ─────────────────────────────────────────────
    -- The `auth.uid() IS NOT NULL` guard. EXECUTE is already revoked from anon,
    -- so this should be unreachable — which is exactly why it is worth testing:
    -- it is the layer that held while the grant was still open.
    PERFORM set_config('request.jwt.claims', '', TRUE);
    SELECT count(*) INTO n_rows FROM event_attendees_preview(ARRAY[ev_open]);
    r := r || jsonb_build_object(
      'step', '3h · no JWT (fail-closed guard)',
      'expected', '0 rows',
      'actual', n_rows || ' rows',
      'verdict', CASE WHEN n_rows = 0 THEN 'PASS' ELSE 'FAIL — LEAK' END);

    -- Undo everything above. Nothing after this line in the block runs.
    RAISE EXCEPTION 'check3-rollback';
  EXCEPTION WHEN OTHERS THEN
    -- A real error would otherwise be swallowed silently and look like a clean
    -- run with missing rows, which is the worst possible failure mode for a
    -- security check.
    IF SQLERRM <> 'check3-rollback' THEN
      r := r || jsonb_build_object(
        'step', 'ERROR — the run stopped here',
        'expected', 'all steps to complete',
        'actual', SQLERRM,
        'verdict', 'CANNOT RUN');
    END IF;
  END;

  RETURN QUERY
  SELECT e->>'step', e->>'expected', e->>'actual', e->>'verdict'
  FROM jsonb_array_elements(r) e;
END;
$fn$;

SELECT * FROM pg_temp.check3();
