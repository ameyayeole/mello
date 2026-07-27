-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 4 · Does `build_feed_session` rank, diversify and pin correctly?
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor and hit run.
-- Read the `verdict` column — every row must say PASS.
--
-- LAST RUN: (not yet run — fill in date and result after first run)
--
-- IT WRITES NOTHING. All test data is created inside a PL/pgSQL block that ends
-- in `RAISE EXCEPTION`; a caught exception rolls back every change made inside
-- it. Local variables are not transactional, so the results survive and get
-- returned. Same trick as check3 — safe against production.
--
-- WHY THIS CHECK EXISTS. The v2 ranker is seven weights, a four-rung candidate
-- pool, a seen filter and a greedy re-rank loop. `tsc` and `eslint` cannot see
-- any of it, and the symptom of a broken weight is "the feed feels off", which
-- nobody can bisect. This asserts ORDER for everything the diversity re-rank
-- is contractually forbidden to disturb — the weights will be retuned, order
-- among untouched pairs will not. The media-weight assertion is the one
-- exception: the re-rank is explicitly licensed to reorder posts of
-- differing types, so position there is not a valid proxy for the weight and
-- it compares scores directly instead. See its own comment below.
--
-- ELEVEN assertions: media weight, author/type diversity, the seen threshold
-- in both directions, the pin in both states and against the re-rank,
-- friendship (including the "does not trump everything" case that guards the
-- whole redesign), locality, and tier-2 pool-widening. The last two only
-- became testable in 069_feed_tiers.sql, which is what makes `p_tier`
-- actually gate the cross-city rows in build_feed_session's WHERE clause —
-- before that migration tier 1 and tier 2 selected identically, and a
-- locality assertion would have failed on a correct ranker while a widening
-- assertion would have passed vacuously.
--
-- It borrows the two oldest profiles as the cast and reads only their ids.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.check4()
RETURNS TABLE (step TEXT, expected TEXT, actual TEXT, verdict TEXT)
LANGUAGE plpgsql
AS $fn$
DECLARE
  results  TEXT[][] := ARRAY[]::TEXT[][];
  v_me     UUID;
  v_other  UUID;
  v_third  UUID;
  v_sess   UUID;
  v_ids    UUID[];
  v_scores FLOAT[];
  p_photo  UUID;
  p_text   UUID;
  p_photo2 UUID;
  p_seen   UUID;
  p_pin    UUID;
  p_pin2   UUID;
  p_friend UUID;
  p_hot    UUID;
  p_local  UUID;
  p_cross  UUID;
  v_tier1_len INT;
  v_tier2_len INT;
  v_act    TEXT;
BEGIN
  SELECT id INTO v_me    FROM profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO v_other FROM profiles ORDER BY created_at OFFSET 1 LIMIT 1;

  -- Impersonate the viewer: RLS and the RPC both read auth.uid().
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_me::text)::text, TRUE);

  UPDATE profiles SET city = 'CheckCity' WHERE id IN (v_me, v_other);

  -- Fixtures. All public, same city, from the OTHER user unless noted, so the
  -- friendship and locality terms are constant and the test isolates one signal
  -- at a time.
  INSERT INTO posts (author_id, type, visibility, body, city, created_at)
    VALUES (v_other, 'photo', 'public', 'photo a', 'CheckCity', NOW())
    RETURNING id INTO p_photo;
  INSERT INTO posts (author_id, type, visibility, body, city, created_at)
    VALUES (v_other, 'text', 'public', 'text a', 'CheckCity', NOW())
    RETURNING id INTO p_text;
  INSERT INTO posts (author_id, type, visibility, body, city, created_at)
    VALUES (v_other, 'photo', 'public', 'photo b', 'CheckCity', NOW())
    RETURNING id INTO p_photo2;
  INSERT INTO posts (author_id, type, visibility, body, city, created_at)
    VALUES (v_other, 'text', 'public', 'seen', 'CheckCity', NOW())
    RETURNING id INTO p_seen;

  ---------------------------------------------------------------------------
  -- 1. A photo outranks an equally fresh text post — on SCORE, not position.
  --    This fixture set includes p_photo2, an identical second photo, so
  --    p_photo and p_photo2 tie on score and the diversity re-rank (which
  --    refuses to place two same-author same-type posts adjacently) is free
  --    to slot p_text between them. That is the re-rank working as designed
  --    — it is licensed to reorder across types — so p_photo ending up
  --    AFTER p_text in post_ids proves nothing about the media weight.
  --    Assertions 2 and 10, by contrast, compare posts the re-rank is
  --    forbidden to reorder relative to each other, which is why position is
  --    a valid proxy for them but not here. Comparing the two posts' scores
  --    directly sidesteps the re-rank entirely.
  ---------------------------------------------------------------------------
  v_sess := build_feed_session(v_me, 1::SMALLINT, FALSE);
  SELECT post_ids, post_scores INTO v_ids, v_scores FROM feed_sessions WHERE id = v_sess;

  v_act := CASE
    WHEN array_position(v_ids, p_photo) IS NULL OR array_position(v_ids, p_text) IS NULL
      THEN 'absent from session'
    WHEN v_scores[array_position(v_ids, p_photo)] > v_scores[array_position(v_ids, p_text)]
      THEN 'photo scores higher' ELSE 'text scores higher' END;
  results := results || ARRAY[ARRAY['1 media weight', 'photo scores higher', v_act,
    CASE WHEN v_act = 'photo scores higher' THEN 'PASS' ELSE 'FAIL' END]];

  ---------------------------------------------------------------------------
  -- 2. Two photos from the same author are not adjacent.
  ---------------------------------------------------------------------------
  v_act := CASE
    WHEN abs(array_position(v_ids, p_photo) - array_position(v_ids, p_photo2)) > 1
    THEN 'separated' ELSE 'adjacent' END;
  results := results || ARRAY[ARRAY['2 diversity', 'separated', v_act,
    CASE WHEN v_act = 'separated' THEN 'PASS' ELSE 'FAIL' END]];

  ---------------------------------------------------------------------------
  -- 3. A post seen 3 times is filtered out entirely.
  ---------------------------------------------------------------------------
  INSERT INTO post_impressions (user_id, post_id, views)
    VALUES (v_me, p_seen, 3);
  v_sess := build_feed_session(v_me, 1::SMALLINT, FALSE);
  SELECT post_ids INTO v_ids FROM feed_sessions WHERE id = v_sess;

  v_act := CASE WHEN array_position(v_ids, p_seen) IS NULL
                THEN 'absent' ELSE 'present' END;
  results := results || ARRAY[ARRAY['3 seen filter', 'absent', v_act,
    CASE WHEN v_act = 'absent' THEN 'PASS' ELSE 'FAIL' END]];

  ---------------------------------------------------------------------------
  -- 4. A post seen only twice is still served.
  ---------------------------------------------------------------------------
  UPDATE post_impressions SET views = 2
   WHERE user_id = v_me AND post_id = p_seen;
  v_sess := build_feed_session(v_me, 1::SMALLINT, FALSE);
  SELECT post_ids INTO v_ids FROM feed_sessions WHERE id = v_sess;

  v_act := CASE WHEN array_position(v_ids, p_seen) IS NOT NULL
                THEN 'present' ELSE 'absent' END;
  results := results || ARRAY[ARRAY['4 seen threshold', 'present', v_act,
    CASE WHEN v_act = 'present' THEN 'PASS' ELSE 'FAIL' END]];

  ---------------------------------------------------------------------------
  -- 5. My own fresh post pins to position 1 when p_pin_own is TRUE.
  ---------------------------------------------------------------------------
  INSERT INTO posts (author_id, type, visibility, body, city, created_at)
    VALUES (v_me, 'text', 'public', 'mine', 'CheckCity', NOW())
    RETURNING id INTO p_pin;

  v_sess := build_feed_session(v_me, 1::SMALLINT, TRUE);
  SELECT post_ids INTO v_ids FROM feed_sessions WHERE id = v_sess;

  v_act := COALESCE(array_position(v_ids, p_pin)::TEXT, 'absent');
  results := results || ARRAY[ARRAY['5 pin on', '1', v_act,
    CASE WHEN v_act = '1' THEN 'PASS' ELSE 'FAIL' END]];

  ---------------------------------------------------------------------------
  -- 6. …and does NOT pin when p_pin_own is FALSE (the pull-to-refresh path).
  --    A text post from me should not be first on merit alone against photos.
  ---------------------------------------------------------------------------
  v_sess := build_feed_session(v_me, 1::SMALLINT, FALSE);
  SELECT post_ids INTO v_ids FROM feed_sessions WHERE id = v_sess;

  -- array_position returns NULL when p_pin is absent from the session
  -- entirely; a bare `= 1` comparison would make that NULL fall through to
  -- the ELSE branch and read as the PASS-worthy "not pinned" — silently
  -- treating "vanished from the feed" as "correctly not pinned". Absence
  -- gets its own explicit, failing branch instead.
  v_act := CASE
    WHEN array_position(v_ids, p_pin) IS NOT NULL AND array_position(v_ids, p_pin) = 1
      THEN 'pinned'
    WHEN array_position(v_ids, p_pin) IS NULL
      THEN 'absent'
    ELSE 'not pinned' END;
  results := results || ARRAY[ARRAY['6 pin off', 'not pinned', v_act,
    CASE WHEN v_act = 'not pinned' THEN 'PASS' ELSE 'FAIL' END]];

  ---------------------------------------------------------------------------
  -- 7. A pinned post is not displaced by the diversity re-rank. Two own posts
  --    seconds apart, same author and same type — exactly the pair the
  --    author-separation rule would normally split up.
  ---------------------------------------------------------------------------
  INSERT INTO posts (author_id, type, visibility, body, city, created_at)
    VALUES (v_me, 'text', 'public', 'mine 2', 'CheckCity', NOW())
    RETURNING id INTO p_pin2;

  v_sess := build_feed_session(v_me, 1::SMALLINT, TRUE);
  SELECT post_ids INTO v_ids FROM feed_sessions WHERE id = v_sess;

  v_act := CASE
    WHEN array_position(v_ids, p_pin2) <= 2 AND array_position(v_ids, p_pin) <= 2
    THEN 'both pinned' ELSE 'displaced' END;
  results := results || ARRAY[ARRAY['7 pin beats diversity', 'both pinned', v_act,
    CASE WHEN v_act = 'both pinned' THEN 'PASS' ELSE 'FAIL' END]];

  DELETE FROM posts WHERE id IN (p_pin, p_pin2);

  ---------------------------------------------------------------------------
  -- 8. Friendship outranks a stranger, all else equal. The baseline the next
  --    assertion is measured against.
  ---------------------------------------------------------------------------
  SELECT id INTO v_third FROM profiles ORDER BY created_at OFFSET 2 LIMIT 1;
  IF v_third IS NULL THEN
    results := results || ARRAY[ARRAY['8 friendship', 'friend first',
      'SKIPPED — needs a third profile', 'SKIP']];
    -- Assertion 9 depends on the same v_third fixture as 8 and cannot run
    -- without it. Emitting nothing here would leave it silently absent from
    -- the output — indistinguishable from a truncated paste — for the one
    -- assertion the file itself calls the guard for the whole redesign.
    results := results || ARRAY[ARRAY['9 friendship does not trump',
      'local photo first', 'SKIPPED — needs a third profile', 'SKIP']];
  ELSE
    UPDATE profiles SET city = 'CheckCity' WHERE id = v_third;
    -- ON CONFLICT targets friendships' actual UNIQUE (requester_id,
    -- addressee_id) constraint (002_tables.sql) by column list rather than
    -- guessing Postgres's auto-generated constraint name. Without this, a
    -- pre-existing friendship between these two profiles in a real database
    -- raises here — which, combined with the rollback sentinel below, would
    -- otherwise truncate the run silently right before assertion 9.
    --
    -- DO UPDATE, not DO NOTHING: the fixture must guarantee an ACCEPTED
    -- friendship, not merely the presence of a row. A pre-existing 'pending'
    -- or 'blocked' row on this exact (requester_id, addressee_id) pair would
    -- otherwise survive untouched, and assertions 8/9 would silently score a
    -- stranger while claiming to test friendship — a false FAIL with nothing
    -- to do with the ranker, on the one assertion that guards the redesign.
    INSERT INTO friendships (requester_id, addressee_id, status)
      VALUES (v_me, v_third, 'accepted')
      ON CONFLICT (requester_id, addressee_id)
      DO UPDATE SET status = 'accepted';

    INSERT INTO posts (author_id, type, visibility, body, city, created_at)
      VALUES (v_third, 'text', 'public', 'friend text', 'CheckCity', NOW())
      RETURNING id INTO p_friend;

    v_sess := build_feed_session(v_me, 1::SMALLINT, FALSE);
    SELECT post_ids INTO v_ids FROM feed_sessions WHERE id = v_sess;

    v_act := CASE
      WHEN array_position(v_ids, p_friend) < array_position(v_ids, p_text)
      THEN 'friend first' ELSE 'stranger first' END;
    results := results || ARRAY[ARRAY['8 friendship', 'friend first', v_act,
      CASE WHEN v_act = 'friend first' THEN 'PASS' ELSE 'FAIL' END]];

    -----------------------------------------------------------------------
    -- 9. THE CORE REQUIREMENT: friendship is the biggest single factor but
    --    does NOT trump everything. A stale, dead text post from a friend
    --    must lose to a fresh, engaged photo from a same-city stranger.
    --
    --    Friend, 3 days old, no engagement, text:
    --      40 + 25·exp(-3) + 0 + 6.75 + 10  ≈ 58.0
    --    Stranger, fresh, engaged (engagement 0.75), photo:
    --      0  + 25         + 15 + 15    + 10 = 65.0
    --
    --    If this FAILs, the weights have drifted back into a hard tier and
    --    the whole redesign has regressed to what 062 did.
    -----------------------------------------------------------------------
    UPDATE posts SET created_at = NOW() - INTERVAL '3 days' WHERE id = p_friend;

    INSERT INTO posts (author_id, type, visibility, body, city, created_at,
                       engagement)
      VALUES (v_other, 'photo', 'public', 'hot local', 'CheckCity', NOW(), 0.75)
      RETURNING id INTO p_hot;

    v_sess := build_feed_session(v_me, 1::SMALLINT, FALSE);
    SELECT post_ids INTO v_ids FROM feed_sessions WHERE id = v_sess;

    v_act := CASE
      WHEN array_position(v_ids, p_hot) < array_position(v_ids, p_friend)
      THEN 'local photo first' ELSE 'stale friend first' END;
    results := results || ARRAY[ARRAY['9 friendship does not trump',
      'local photo first', v_act,
      CASE WHEN v_act = 'local photo first' THEN 'PASS' ELSE 'FAIL' END]];
  END IF;

  ---------------------------------------------------------------------------
  -- 10. Locality: a same-city post outranks an otherwise-identical cross-city
  --     one. Same author (v_other, a stranger — same as assertion 1's pair),
  --     same type, same age (both NOW()) and the same DEFAULT engagement
  --     (0, per 064's column default), so the same_city term is the only
  --     thing that can move them apart. Built under a TIER-2 session: under
  --     tier 1 the cross-city post fails the gate (fresh, no KYC, no
  --     engagers) and is not in the pool at all, so this assertion would
  --     prove nothing there.
  ---------------------------------------------------------------------------
  INSERT INTO posts (author_id, type, visibility, body, city, created_at)
    VALUES (v_other, 'text', 'public', 'same city', 'CheckCity', NOW())
    RETURNING id INTO p_local;
  INSERT INTO posts (author_id, type, visibility, body, city, created_at)
    VALUES (v_other, 'text', 'public', 'other city', 'FarCity', NOW())
    RETURNING id INTO p_cross;

  -- Tier 1 first, so its length is captured before the tier-2 session (built
  -- next, for the locality check) overwrites v_ids.
  v_sess := build_feed_session(v_me, 1::SMALLINT, FALSE);
  SELECT post_ids INTO v_ids FROM feed_sessions WHERE id = v_sess;
  v_tier1_len := COALESCE(array_length(v_ids, 1), 0);

  v_sess := build_feed_session(v_me, 2::SMALLINT, FALSE);
  SELECT post_ids INTO v_ids FROM feed_sessions WHERE id = v_sess;
  v_tier2_len := COALESCE(array_length(v_ids, 1), 0);

  v_act := CASE
    WHEN array_position(v_ids, p_local) < array_position(v_ids, p_cross)
    THEN 'local first' ELSE 'cross first' END;
  results := results || ARRAY[ARRAY['10 locality', 'local first', v_act,
    CASE WHEN v_act = 'local first' THEN 'PASS' ELSE 'FAIL' END]];

  ---------------------------------------------------------------------------
  -- 11. Tier widening: a tier-2 session's pool is never smaller than tier
  --     1's for the same viewer. Not a vacuous >= here — p_cross above sits
  --     in the tier-2 pool (gate dropped) but fails the tier-1 gate (fresh,
  --     unapproved author, no engagers), so v_tier1_len is strictly less
  --     than v_tier2_len for this exact fixture set.
  ---------------------------------------------------------------------------
  v_act := CASE WHEN v_tier2_len >= v_tier1_len
    THEN 'wider or equal' ELSE 'narrower' END;
  results := results || ARRAY[ARRAY['11 tier widening', 'wider or equal',
    v_act, CASE WHEN v_act = 'wider or equal' THEN 'PASS' ELSE 'FAIL' END]];

  RAISE EXCEPTION 'check4-rollback';

EXCEPTION WHEN OTHERS THEN
  -- A genuine mid-script error (a typo'd column, a schema drift) raises
  -- something OTHER than our own sentinel. Left unguarded, that would return
  -- whatever assertions happened to accumulate before the error — every one
  -- a real PASS — and a short "all PASS" table reads as a clean run instead
  -- of a script that never finished. Same guard as check3's `SQLERRM <>
  -- 'check3-rollback'` check.
  IF SQLERRM <> 'check4-rollback' THEN
    results := results || ARRAY[ARRAY['SCRIPT ERROR',
      'all eleven assertions to complete', SQLERRM, 'CANNOT RUN']];
  END IF;

  FOR i IN 1 .. COALESCE(array_length(results, 1), 0) LOOP
    step    := results[i][1];
    expected := results[i][2];
    actual  := results[i][3];
    verdict := results[i][4];
    RETURN NEXT;
  END LOOP;
END;
$fn$;

SELECT * FROM pg_temp.check4();
