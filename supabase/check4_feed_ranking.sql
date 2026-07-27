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
-- nobody can bisect. This asserts ORDER, not scores — order is the contract,
-- the weights will be retuned.
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
  v_n1     INT;
  v_n2     INT;
  p_photo  UUID;
  p_text   UUID;
  p_photo2 UUID;
  p_seen   UUID;
  p_pin    UUID;
  p_pin2   UUID;
  p_friend UUID;
  p_hot    UUID;
  p_far    UUID;
  p_near   UUID;
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
  -- 1. A photo outranks an equally fresh text post.
  ---------------------------------------------------------------------------
  v_sess := build_feed_session(v_me, 1::SMALLINT, FALSE);
  SELECT post_ids INTO v_ids FROM feed_sessions WHERE id = v_sess;

  v_act := CASE
    WHEN array_position(v_ids, p_photo) < array_position(v_ids, p_text)
    THEN 'photo first' ELSE 'text first' END;
  results := results || ARRAY[ARRAY['1 media weight', 'photo first', v_act,
    CASE WHEN v_act = 'photo first' THEN 'PASS' ELSE 'FAIL' END]];

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

  v_act := CASE WHEN array_position(v_ids, p_pin) = 1
                THEN 'pinned' ELSE 'not pinned' END;
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
  ELSE
    UPDATE profiles SET city = 'CheckCity' WHERE id = v_third;
    INSERT INTO friendships (requester_id, addressee_id, status)
      VALUES (v_me, v_third, 'accepted');

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
  -- 10. Locality: a same-city post outranks an identical cross-city one.
  --     The cross-city post is given the gate-clearing shape (public, old
  --     enough) so it is in the pool at all — this tests ranking, not scoping.
  ---------------------------------------------------------------------------
  INSERT INTO posts (author_id, type, visibility, body, city, created_at,
                     engagement)
    VALUES (v_other, 'text', 'public', 'far away', 'OtherCity',
            NOW() - INTERVAL '1 hour', 0.5)
    RETURNING id INTO p_far;
  INSERT INTO posts (author_id, type, visibility, body, city, created_at,
                     engagement)
    VALUES (v_other, 'text', 'public', 'near by', 'CheckCity',
            NOW() - INTERVAL '1 hour', 0.5)
    RETURNING id INTO p_near;

  -- Tier 2 so the cross-city post is in the pool regardless of KYC.
  v_sess := build_feed_session(v_me, 2::SMALLINT, FALSE);
  SELECT post_ids INTO v_ids FROM feed_sessions WHERE id = v_sess;

  v_act := CASE
    WHEN array_position(v_ids, p_near) < array_position(v_ids, p_far)
    THEN 'near first' ELSE 'far first' END;
  results := results || ARRAY[ARRAY['10 locality', 'near first', v_act,
    CASE WHEN v_act = 'near first' THEN 'PASS' ELSE 'FAIL' END]];

  ---------------------------------------------------------------------------
  -- 11. Tier 2 widens the pool rather than replacing it — every tier-1 post
  --     must still be present.
  ---------------------------------------------------------------------------
  v_sess := build_feed_session(v_me, 1::SMALLINT, FALSE);
  SELECT post_ids INTO v_ids FROM feed_sessions WHERE id = v_sess;
  v_n1 := COALESCE(array_length(v_ids, 1), 0);

  v_sess := build_feed_session(v_me, 2::SMALLINT, FALSE);
  SELECT post_ids INTO v_ids FROM feed_sessions WHERE id = v_sess;
  v_n2 := COALESCE(array_length(v_ids, 1), 0);

  v_act := CASE WHEN v_n2 >= v_n1 THEN 'wider or equal' ELSE 'narrower' END;
  results := results || ARRAY[ARRAY['11 tier 2 widens',
    'wider or equal', v_act || ' (' || v_n1 || '→' || v_n2 || ')',
    CASE WHEN v_n2 >= v_n1 THEN 'PASS' ELSE 'FAIL' END]];

  RAISE EXCEPTION 'rollback';

EXCEPTION WHEN OTHERS THEN
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
