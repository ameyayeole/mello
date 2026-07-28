-- ─────────────────────────────────────────────────────────────────────────────
-- SEED · Test data for the Community feed ranking device sheet (section D).
--
-- HOW TO RUN: set YOUR user id on the marked line below, then paste this whole
-- file into the Supabase SQL editor and run it. It prints a summary at the end.
--
-- ⚠️  UNLIKE check3 AND check4, THIS SCRIPT COMMITS. It is the only script in
-- this directory that writes real rows. Cleanup is one statement, given at the
-- bottom and printed in the summary — run it when you are done testing.
--
-- WHY IT EXISTS. Section D needs ~25+ posts across several authors, mixed
-- types, varied age and varied engagement, or half its rows cannot be judged:
-- you cannot check "no two consecutive posts from the same author" (D6) on a
-- feed of four posts, and you cannot check for duplicates across five pages
-- (D1) if there are not five pages.
--
-- EVERY SEEDED POST IS LABELLED IN ITS OWN BODY — "Seed 07 · photo · 2d ·
-- author B". That is deliberate and is the point: while you scroll, the card
-- tells you its author, type and age, so D1 (no duplicates), D2 (order stable)
-- and D6 (no author or photo runs) become things you can read off the screen
-- instead of things you have to remember.
--
-- ENGAGEMENT IS CREATED WITH REAL LIKES, NOT BY SETTING posts.engagement.
-- refresh_post_scores() recomputes engagement every 10 minutes from actual
-- post_likes/post_comments/poll_votes rows, so a hand-set value silently
-- reverts within ten minutes and the spread you thought you seeded disappears.
-- Real like rows survive, and the trigger from 046 keeps like_count honest.
--
-- IT DOES NOT TOUCH FRIENDSHIPS. Friend-tier rows (D5, D7) need a real accepted
-- friendship, which is a relationship between two real people — seeding that
-- silently is the kind of thing that outlives a test session. Add one from the
-- app, or run the friendship snippet at the very bottom deliberately.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  ---------------------------------------------------------------------------
  -- ⬇⬇⬇  EDIT THIS: paste your own profile id, no angle brackets.  ⬇⬇⬇
  ---------------------------------------------------------------------------
  v_me        UUID := '00000000-0000-0000-0000-000000000000';
  ---------------------------------------------------------------------------

  v_city      TEXT;
  v_authors   UUID[];
  v_likers    UUID[];
  v_photos    TEXT[];
  v_author    UUID;
  v_post      UUID;
  v_type      post_type;
  v_age_h     INT;
  v_likes     INT;
  v_label     TEXT;
  v_letter    TEXT;
  i           INT;
  j           INT;
  n_authors   INT;
  n_likers    INT;
  n_made      INT := 0;
BEGIN
  IF v_me = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'Set v_me to your own profile id first (line ~40).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_me) THEN
    RAISE EXCEPTION 'No profile with id % — check the id you pasted.', v_me;
  END IF;

  -- Seed into YOUR city so the posts land in the local pool. A NULL city would
  -- put every seeded post outside the same-city rung and behind the cross-city
  -- gate, which needs a KYC-approved author — most would never appear at all.
  SELECT city INTO v_city FROM profiles WHERE id = v_me;
  IF v_city IS NULL THEN
    RAISE EXCEPTION 'Your profile has no city set. Set one in the app first — '
      'the feed''s locality term and its same-city pool rung both need it.';
  END IF;

  -- Authors: up to three OTHER people. Never you — your own posts under five
  -- minutes old pin to the top, which would fight the D9-D15 pin rows.
  SELECT array_agg(id) INTO v_authors
    FROM (SELECT id FROM profiles WHERE id <> v_me ORDER BY created_at LIMIT 3) a;

  IF v_authors IS NULL OR array_length(v_authors, 1) < 2 THEN
    RAISE EXCEPTION 'Need at least 2 other profiles to seed a feed worth '
      'testing (found %). Author diversity (D6) is untestable otherwise.',
      COALESCE(array_length(v_authors, 1), 0);
  END IF;
  n_authors := array_length(v_authors, 1);

  -- Likers: anyone at all, including you. Each like must come from a distinct
  -- user (post_likes PK is (post_id, user_id)), so the number of profiles in
  -- the database caps how much engagement any single post can show.
  SELECT array_agg(id) INTO v_likers
    FROM (SELECT id FROM profiles ORDER BY created_at LIMIT 8) a;
  n_likers := array_length(v_likers, 1);

  -- Reuse image URLs that already load in this app rather than inventing any.
  -- An external placeholder host may be blocked, slow, or simply wrong for
  -- expo-image's cache, and a grid of broken thumbnails makes D6 ("photos are
  -- broken up") impossible to judge by eye.
  -- Each UNION branch is parenthesised because a bare LIMIT before UNION is a
  -- syntax error: Postgres reads that LIMIT as belonging to the whole union,
  -- then hits the UNION keyword where it expected the end of the statement.
  SELECT array_agg(u) INTO v_photos FROM (
    (SELECT unnest(media) AS u FROM posts
       WHERE array_length(media, 1) > 0 AND hidden = FALSE LIMIT 6)
    UNION
    (SELECT photo_url FROM profiles WHERE photo_url IS NOT NULL LIMIT 6)
  ) x WHERE u IS NOT NULL;

  ---------------------------------------------------------------------------
  -- 30 posts: 3 pages of 10. Type cycles photo/text/photo/poll so the ranker
  -- has runs to break up; age spreads 0-5 days so recency actually separates
  -- them; likes spread 0-5 so engagement does too.
  ---------------------------------------------------------------------------
  FOR i IN 1..30 LOOP
    v_author := v_authors[1 + (i % n_authors)];
    v_letter := chr(65 + (1 + (i % n_authors)) - 1);   -- A, B, C

    v_type := CASE (i % 4)
                WHEN 0 THEN 'poll'::post_type
                WHEN 2 THEN 'text'::post_type
                ELSE        'photo'::post_type
              END;

    -- Ages 0h,4h,8h… up to ~5 days, but never inside the 5-minute pin window.
    v_age_h := ((i - 1) * 4);
    v_likes := (i * 3) % 6;      -- 0..5, uncorrelated with age or author

    v_label := 'Seed ' || lpad(i::TEXT, 2, '0') || ' · ' || v_type
             || ' · ' || v_age_h || 'h · author ' || v_letter;

    INSERT INTO posts (author_id, type, visibility, body, media, city, created_at)
    VALUES (
      v_author,
      v_type,
      'public',
      v_label,
      CASE WHEN v_type = 'photo' AND v_photos IS NOT NULL
           THEN ARRAY[v_photos[1 + (i % array_length(v_photos, 1))]]
           ELSE '{}'::TEXT[] END,
      v_city,
      NOW() - (v_age_h || ' hours')::INTERVAL - INTERVAL '6 minutes'
    )
    RETURNING id INTO v_post;

    -- A poll post needs its polls row and options, or the card renders empty.
    IF v_type = 'poll' THEN
      INSERT INTO polls (post_id, closes_at)
        VALUES (v_post, NOW() + INTERVAL '3 days');
      INSERT INTO poll_options (poll_id, idx, label)
        VALUES (v_post, 0, 'Option one'), (v_post, 1, 'Option two');
    END IF;

    -- Real likes → real engagement once refresh_post_scores() runs below.
    -- Capped at the number of distinct profiles available.
    FOR j IN 1..LEAST(v_likes, n_likers) LOOP
      INSERT INTO post_likes (post_id, user_id) VALUES (v_post, v_likers[j])
      ON CONFLICT DO NOTHING;
    END LOOP;

    n_made := n_made + 1;
  END LOOP;

  -- Populate engagement now rather than waiting up to 10 minutes for the cron,
  -- so the feed is worth looking at the moment you open the app.
  PERFORM refresh_post_scores();

  RAISE NOTICE '─────────────────────────────────────────────────────────';
  RAISE NOTICE 'Seeded % posts across % authors in city "%".',
    n_made, n_authors, v_city;
  RAISE NOTICE 'Every body is labelled "Seed NN · type · age · author X".';
  RAISE NOTICE '';
  RAISE NOTICE 'CLEAN UP WHEN DONE:';
  RAISE NOTICE '  DELETE FROM posts WHERE body LIKE ''Seed __ · %%'';';
  RAISE NOTICE '(likes, polls and options cascade; impressions cascade too)';
  RAISE NOTICE '─────────────────────────────────────────────────────────';
END $$;

-- The RAISE NOTICE output above may not surface in the Supabase SQL editor's
-- results pane, so this runs unconditionally as the visible confirmation.
-- Expect 30 rows.
SELECT
  body,
  type,
  round(engagement::numeric, 2) AS engagement,
  like_count,
  date_trunc('minute', created_at) AS created_at
FROM posts
WHERE body LIKE 'Seed __ · %'
ORDER BY created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- CLEANUP — run this when you have finished section D.
-- post_likes, polls, poll_options and post_impressions all cascade from posts.
-- ─────────────────────────────────────────────────────────────────────────────
--
--   DELETE FROM posts WHERE body LIKE 'Seed __ · %';

-- ─────────────────────────────────────────────────────────────────────────────
-- OPTIONAL — a friendship, for the friend-tier rows (D5, D7).
-- Deliberately separate: this creates a real relationship between two real
-- accounts and will outlive your test session unless you remove it.
-- Replace both ids, run, and delete the row afterwards.
-- ─────────────────────────────────────────────────────────────────────────────
--
--   INSERT INTO friendships (requester_id, addressee_id, status)
--   VALUES ('<your-id>', '<their-id>', 'accepted')
--   ON CONFLICT (requester_id, addressee_id) DO UPDATE SET status = 'accepted';
--
--   -- undo:
--   -- DELETE FROM friendships WHERE requester_id = '<your-id>' AND addressee_id = '<their-id>';
