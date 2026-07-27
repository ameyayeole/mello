-- ─────────────────────────────────────────────────────────────────────────────
-- FEED TIERS + v1 RANKING RETIREMENT.
--
-- Part 1: build_feed_session's tier 2 (the client already requests it —
-- useCommunityFeed.ts advances to LAST_TIER when a tier-1 session runs dry,
-- src/services/community/posts.service.ts passes p_tier straight through)
-- currently re-runs the SAME cross-city gates as tier 1 (KYC'd author, 30+
-- minutes old, 3+ distinct 48h engagers). That makes tier 2 pointless: if a
-- post couldn't clear the gate for tier 1, it can't clear it for tier 2
-- either, so exhausting tier 1 leads straight to an empty tier 2 and a dead
-- end, which is the empty-feed failure the tiers exist to prevent. This
-- migration makes tier 2 drop those gates entirely — any public post,
-- anywhere, becomes eligible. The gates stay for tier 1 because keeping the
-- MAIN feed local and trustworthy is a deliberate design choice, not an
-- oversight the gate-dropping is "fixing"; tier 2 only exists because the
-- alternative, at the bottom of the feed, is a dead end instead of a wider
-- pool. Tier 2 deliberately contradicting tier 1 is the design. Do not
-- collapse them to match.
--
-- Everything else in build_feed_session below is copied verbatim from
-- 067_feed_city_pool.sql (the currently shipped version, not 066 and not any
-- plan document), including three fixes that predate 067 and one that 067
-- itself introduced — all four are load-bearing and easy to silently regress
-- by reconstructing this function from memory or from a spec:
--   1. Own-post seen exemption — a post's author is exempted from the
--      seen-3-times filter, or viewing your own post three times deletes it
--      from your own feed.
--   2. COALESCE'd is_pinned — an explicitly-passed NULL p_pin_own makes the
--      pin conjunct NULL, and a NULL satisfies neither `WHERE is_pinned` nor
--      `WHERE NOT is_pinned`, so the post vanishes from the session instead
--      of merely losing its pin. COALESCE to FALSE closes that gap.
--   3. Double-clamped recency exp() — GREATEST alone only guards underflow;
--      a future-dated created_at (clock skew, a bad insert) makes the
--      exponent positive and exp() raises "value out of range: overflow",
--      aborting the whole session build for every viewer who would have seen
--      that post. LEAST(..., 0.0) added on top guards that end too.
--   4. in_local_pool — pool MEMBERSHIP, split out from the same_city SCORING
--      term. Without its own predicate, the feed collapses to own+friends
--      posts only for any viewer with no city on their profile, which is
--      currently everyone.
--
-- Part 2: retires the v1 ranking columns. posts.score (061) and hot_since
-- (044/061) back community_feed (045-062), which the client stopped calling
-- once it swapped to community_feed_page (066); nothing else reads either
-- column. hot_since in particular was write-only for its entire life — 061
-- wrote it, every later version of refresh_post_scores (064, and this one)
-- carried the write forward or dropped it, but no query, view, or function in
-- this codebase has ever selected it. Both columns are dropped, community_feed
-- is dropped, and refresh_post_scores is rewritten to maintain only
-- `engagement`, the v2 ranker's normalised engagement sub-score.
--
-- get_post (063) selects p.score and declares it in RETURNS TABLE — that is
-- the deep-link / notification-tap path, has no automated coverage, and would
-- silently break the moment posts.score disappeared underneath it. It is
-- re-created here, verbatim from 063, with p.score replaced by 0::FLOAT: the
-- column is retained in the return shape only because the shared
-- CommunityPost TypeScript type requires a `score` field, and nothing on this
-- path reads its value.
--
-- Statement order matters: community_feed is dropped, and get_post is
-- redefined to no longer touch posts.score, BEFORE the ALTER TABLE DROP
-- COLUMN statements, so nothing here ever hits a "column does not exist"
-- error against its own migration. Idempotent — safe to paste this whole file
-- twice; on the second pass the columns are already gone, and neither
-- get_post nor refresh_post_scores below reference them, so nothing breaks.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── build_feed_session ──────────────────────────────────────────────────────
-- Ranks the whole candidate pool once and freezes it into a feed_sessions row.
--
-- Order of operations, and it matters:
--   1. pool      — tier scoping, minus posts seen 3+ times
--   2. score     — normalised 0–1 signals, weighted
--   3. diversify — greedy re-rank so authors and post types do not run together
--   4. pin       — own posts under 5 minutes old go to the head, AFTER the
--                  diversity pass so it cannot displace them
CREATE OR REPLACE FUNCTION build_feed_session(
  p_user_id UUID,
  p_tier    SMALLINT DEFAULT 1,
  p_pin_own BOOLEAN  DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  -- ── WEIGHTS ───────────────────────────────────────────────────────────────
  -- Every signal is a 0–1 sub-score; these are what turn them into a ranking.
  -- They sum to 110. Friendship is the heaviest single lever but three other
  -- signals together can outvote it — that is the whole point of normalising.
  -- Retune by editing these numbers, never by inlining constants below.
  W_FRIEND   CONSTANT FLOAT := 40.0;
  W_RECENCY  CONSTANT FLOAT := 25.0;
  W_ENGAGE   CONSTANT FLOAT := 20.0;
  W_MEDIA    CONSTANT FLOAT := 15.0;
  W_LOCAL    CONSTANT FLOAT := 10.0;

  -- Media ladder. photo > shared_wrap > poll > text. The floor is 0.45, not 0,
  -- so the photo→text gap is ~8.25 points ≈ 10 hours of freshness. At a 0.2
  -- floor it was ~16 hours, which buries good text posts permanently.
  M_PHOTO    CONSTANT FLOAT := 1.00;
  M_WRAP     CONSTANT FLOAT := 0.90;
  M_POLL     CONSTANT FLOAT := 0.70;
  M_TEXT     CONSTANT FLOAT := 0.45;

  SEEN_LIMIT CONSTANT INT := 3;    -- views before a post is filtered out
  POOL_CAP   CONSTANT INT := 500;  -- bounds the snapshot and the re-rank loop
  LOOKAHEAD  CONSTANT INT := 10;   -- max slots the diversity pass may displace

  v_city    TEXT;
  v_session UUID;

  -- Parallel arrays for the diversity pass. plpgsql has no array-of-record, and
  -- a temp table per call would churn pg_catalog for no benefit at this size.
  c_ids     UUID[];
  c_authors UUID[];
  c_types   post_type[];
  c_scores  FLOAT[];
  used      BOOLEAN[];
  n         INT;
  head      INT := 1;   -- first possibly-unused index; keeps the loop near O(n·K)
  i         INT;
  k         INT;
  pick      INT;
  scanned   INT;

  pin_ids     UUID[]  := ARRAY[]::UUID[];
  pin_scores  FLOAT[] := ARRAY[]::FLOAT[];
  out_ids     UUID[]  := ARRAY[]::UUID[];
  out_scores  FLOAT[] := ARRAY[]::FLOAT[];
  last_author UUID      := NULL;
  last_type   post_type := NULL;
BEGIN
  SELECT pr.city INTO v_city FROM profiles pr WHERE pr.id = p_user_id;

  CREATE TEMP TABLE IF NOT EXISTS _bfs_scored (
    id         UUID,
    author_id  UUID,
    type       post_type,
    created_at TIMESTAMPTZ,
    is_pinned  BOOLEAN,
    score      FLOAT
  ) ON COMMIT DROP;
  TRUNCATE _bfs_scored;

  INSERT INTO _bfs_scored
  WITH friends AS (
    SELECT CASE WHEN f.requester_id = p_user_id THEN f.addressee_id
                ELSE f.requester_id END AS fid
      FROM friendships f
     WHERE f.status = 'accepted'
       AND (f.requester_id = p_user_id OR f.addressee_id = p_user_id)
  ),
  pool AS (
    SELECT
      p.id, p.author_id, p.type, p.created_at, p.engagement, p.visibility,
      (p.author_id = p_user_id)                        AS is_own,
      EXISTS (SELECT 1 FROM friends WHERE fid = p.author_id) AS is_friend,
      (p.author_id = p_user_id
       OR (p.city = v_city AND v_city IS NOT NULL))    AS same_city,
      -- Pool membership, deliberately separate from the same_city SCORING term
      -- above. A viewer with no city has nothing to narrow by, so everything is
      -- local to them — the alternative is the feed they have now, which is
      -- their own posts plus friends' only.
      --
      -- This intentionally degrades toward "show everything" rather than 062's
      -- "show other city-less posts": as real city data appears, the latter
      -- would shrink toward an empty feed for anyone without a location, which
      -- is the worse failure.
      (v_city IS NULL
       OR p.city = v_city
       OR p.author_id = p_user_id)                     AS in_local_pool,
      pr.kyc_status AS a_kyc,
      (SELECT COUNT(DISTINCT u) FROM (
         SELECT pl.user_id AS u FROM post_likes pl
           WHERE pl.post_id = p.id
             AND pl.created_at > NOW() - INTERVAL '48 hours'
         UNION
         SELECT pc.author_id FROM post_comments pc
           WHERE pc.post_id = p.id AND pc.deleted_at IS NULL
             AND pc.created_at > NOW() - INTERVAL '48 hours'
       ) e) AS engagers_48h
    FROM posts p
    JOIN profiles pr ON pr.id = p.author_id
    WHERE p.hidden = FALSE
      AND p.created_at > NOW() - INTERVAL '30 days'
      -- Your own posts are never suppressed, only un-pinned. Without this
      -- exemption, glancing at your own post three times deletes it from your
      -- own feed.
      AND (
        p.author_id = p_user_id
        OR NOT EXISTS (
          SELECT 1 FROM post_impressions pi
           WHERE pi.user_id = p_user_id
             AND pi.post_id = p.id
             AND pi.views >= SEEN_LIMIT
        )
      )
  )
  SELECT
    pool.id,
    pool.author_id,
    pool.type,
    pool.created_at,
    -- COALESCE, not decoration: an explicitly-passed NULL p_pin_own (Postgres
    -- does not substitute the DEFAULT for an explicit NULL argument) makes
    -- this whole conjunct NULL. A NULL is_pinned satisfies neither
    -- WHERE s.is_pinned nor WHERE NOT s.is_pinned below, so the post would
    -- vanish from the session entirely instead of merely losing its pin.
    COALESCE(p_pin_own AND pool.is_own
       AND pool.created_at > NOW() - INTERVAL '5 minutes', FALSE) AS is_pinned,
    (
        W_FRIEND  * CASE WHEN pool.is_friend THEN 1.0 ELSE 0.0 END
      -- Recency quantised to the hour: successive session builds a few minutes
      -- apart then produce near-identical order instead of micro-reshuffling.
      -- LEAST(..., 0.0) is the overflow guard and is not decoration. A post
      -- with a future created_at makes this exponent positive, and exp()
      -- raises "value out of range: overflow", aborting the whole session
      -- build for every viewer who would have seen that post. Clamping at 0
      -- caps recency at its natural maximum of 1.0. GREATEST(..., -700.0)
      -- guards the far end, where exp() underflows below roughly -745.
      + W_RECENCY * exp(LEAST(GREATEST(
          -floor(EXTRACT(EPOCH FROM (NOW() - pool.created_at)) / 3600.0) / 24.0,
          -700.0), 0.0))
      + W_ENGAGE  * pool.engagement
      + W_MEDIA   * CASE pool.type
                      WHEN 'photo'       THEN M_PHOTO
                      WHEN 'shared_wrap' THEN M_WRAP
                      WHEN 'poll'        THEN M_POLL
                      ELSE                    M_TEXT
                    END
      + W_LOCAL   * CASE WHEN pool.same_city THEN 1.0 ELSE 0.0 END
    )::FLOAT AS score
  FROM pool
  WHERE
    pool.is_own OR pool.is_friend OR pool.in_local_pool
    -- Cross-city rung. Tier 1 keeps the gates (cross-city virality is a
    -- designed feature, not an overflow behaviour); 067 adds tier 2, which
    -- drops them. The engager floor uses the SAME 48h window as the score —
    -- 062 counted lifetime engagers here and 48h there, one word meaning two
    -- different things.
    OR (
      pool.visibility = 'public'
      AND (
        -- Tier 2+ drops the cross-city gates: any public post, anywhere. The
        -- gates exist to keep the MAIN feed local and trustworthy; at the
        -- bottom of the feed the alternative to a wider pool is a dead end.
        -- This deliberately contradicts tier 1 — that is the design, not an
        -- oversight. Do not "fix" it.
        p_tier >= 2
        OR (
          pool.a_kyc = 'approved'
          AND pool.created_at < NOW() - INTERVAL '30 minutes'
          AND pool.engagers_48h >= 3
        )
      )
    );

  -- Pinned posts, newest first. Held out of the diversity pass entirely.
  SELECT COALESCE(array_agg(s.id    ORDER BY s.created_at DESC), ARRAY[]::UUID[]),
         COALESCE(array_agg(s.score ORDER BY s.created_at DESC), ARRAY[]::FLOAT[])
    INTO pin_ids, pin_scores
    FROM _bfs_scored s WHERE s.is_pinned;

  -- Everything else, best first, capped.
  SELECT COALESCE(array_agg(r.id        ORDER BY r.ord), ARRAY[]::UUID[]),
         COALESCE(array_agg(r.author_id ORDER BY r.ord), ARRAY[]::UUID[]),
         COALESCE(array_agg(r.type      ORDER BY r.ord), ARRAY[]::post_type[]),
         COALESCE(array_agg(r.score     ORDER BY r.ord), ARRAY[]::FLOAT[])
    INTO c_ids, c_authors, c_types, c_scores
    FROM (
      SELECT s.*, ROW_NUMBER() OVER (
               ORDER BY s.score DESC, s.created_at DESC, s.id DESC) AS ord
        FROM _bfs_scored s
       WHERE NOT s.is_pinned
       ORDER BY s.score DESC, s.created_at DESC, s.id DESC
       LIMIT POOL_CAP
    ) r;

  -- ── DIVERSITY RE-RANK ─────────────────────────────────────────────────────
  -- Greedy with a LOOKAHEAD bound. Both Meta ("do not show items from the same
  -- authors in a sequence") and X ("Author Diversity") apply this AFTER
  -- scoring, never as a score term — a score cannot express "not adjacent".
  --
  -- Author separation is checked before type separation because it is the rule
  -- both of them enforce, and three posts from one friend is more jarring than
  -- two photos in a row.
  --
  -- The LOOKAHEAD bound is what keeps score dominant: a post can be displaced
  -- at most K slots, so a genuinely great photo is never held back
  -- indefinitely. It also degrades gracefully — a photo-only pool still yields
  -- the whole feed, just reordered.
  n := COALESCE(array_length(c_ids, 1), 0);
  IF n > 0 THEN
    used := array_fill(FALSE, ARRAY[n]);

    FOR i IN 1..n LOOP
      WHILE head <= n AND used[head] LOOP head := head + 1; END LOOP;

      pick := NULL;

      -- Pass 1: different author AND different type.
      scanned := 0;
      FOR k IN head..n LOOP
        CONTINUE WHEN used[k];
        scanned := scanned + 1;
        EXIT WHEN scanned > LOOKAHEAD;
        IF (last_author IS NULL OR c_authors[k] IS DISTINCT FROM last_author)
           AND (last_type IS NULL OR c_types[k] IS DISTINCT FROM last_type) THEN
          pick := k; EXIT;
        END IF;
      END LOOP;

      -- Pass 2: relax the type rule, keep author separation.
      IF pick IS NULL THEN
        scanned := 0;
        FOR k IN head..n LOOP
          CONTINUE WHEN used[k];
          scanned := scanned + 1;
          EXIT WHEN scanned > LOOKAHEAD;
          IF last_author IS NULL OR c_authors[k] IS DISTINCT FROM last_author THEN
            pick := k; EXIT;
          END IF;
        END LOOP;
      END IF;

      -- Pass 3: nothing separable within the window — take the best remaining.
      IF pick IS NULL THEN pick := head; END IF;

      used[pick]  := TRUE;
      out_ids     := out_ids    || c_ids[pick];
      out_scores  := out_scores || c_scores[pick];
      last_author := c_authors[pick];
      last_type   := c_types[pick];
    END LOOP;
  END IF;

  INSERT INTO feed_sessions (user_id, tier, post_ids, post_scores)
  VALUES (p_user_id, p_tier, pin_ids || out_ids, pin_scores || out_scores)
  RETURNING id INTO v_session;

  RETURN v_session;
END;
$$;

-- ─── get_post ────────────────────────────────────────────────────────────────
-- One post in the community_feed row shape, for the post detail screen
-- (deep links + notification tap-through). SECURITY INVOKER → posts RLS decides
-- visibility, so a viewer who can't see it (or a hidden post) gets no row and
-- the screen shows "unavailable".
--
-- Verbatim from 063_get_post.sql with exactly one change: p.score is replaced
-- by 0::FLOAT below, because posts.score no longer exists after this
-- migration. `score` stays in RETURNS TABLE only because the shared
-- CommunityPost TypeScript type requires the field; nothing on this path
-- reads its value.
DROP FUNCTION IF EXISTS get_post(UUID, UUID);
CREATE OR REPLACE FUNCTION get_post(p_post_id UUID, p_user_id UUID)
RETURNS TABLE (
  id                UUID,
  author_id         UUID,
  author_name       TEXT,
  author_photo_url  TEXT,
  type              post_type,
  visibility        post_visibility,
  body              TEXT,
  media             TEXT[],
  city              TEXT,
  like_count        INT,
  comment_count     INT,
  created_at        TIMESTAMPTZ,
  liked_by_me       BOOLEAN,
  comments_enabled  BOOLEAN,
  ref_wrap_event_id UUID,
  score             FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id, p.author_id, pr.name, pr.photo_url, p.type, p.visibility,
    p.body, p.media, p.city, p.like_count, p.comment_count, p.created_at,
    EXISTS (SELECT 1 FROM post_likes pl
            WHERE pl.post_id = p.id AND pl.user_id = p_user_id) AS liked_by_me,
    p.comments_enabled,
    p.ref_wrap_event_id,
    0::FLOAT -- posts.score is gone (see column drop below); retained here only
             -- because CommunityPost requires a `score` field, and nothing
             -- reads it on this path.
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  WHERE p.id = p_post_id AND p.hidden = FALSE;
$$;

-- ─── retire community_feed (v1) ──────────────────────────────────────────────
-- Unused since the client swapped to community_feed_page (066). Dropped before
-- the column ALTERs below so nothing in this file references posts.score once
-- it is gone.
DROP FUNCTION IF EXISTS community_feed(UUID, FLOAT, TIMESTAMPTZ, UUID, INT);

-- ─── retire the v1 ranking columns ───────────────────────────────────────────
-- posts.score backed only community_feed (v1), just dropped above.
-- posts.hot_since backed nothing: 061 wrote it, every later version of
-- refresh_post_scores either carried the write forward or (from 064 on)
-- dropped it, and no query anywhere in this codebase has ever read it.
ALTER TABLE posts DROP COLUMN IF EXISTS score;
ALTER TABLE posts DROP COLUMN IF EXISTS hot_since;

-- ─── refresh_post_scores ─────────────────────────────────────────────────────
-- Now maintains only `engagement`, the v2 ranker's normalised 0–1 signal.
-- The engagement expression is copied verbatim from 064_post_scoring_v2.sql
-- (poll votes count, commenters are weighted twice, LEAST(ln(1+raw)/ln(26.0),
-- 1.0) saturates at 25 weighted engagers). The old composite `score`
-- assignment is dropped along with the column it wrote.
CREATE OR REPLACE FUNCTION refresh_post_scores()
RETURNS void AS $$
BEGIN
  UPDATE posts p SET
    -- Normalised to 0–1. ln(26) saturates at 25 weighted engagers, which is
    -- generous at Mello's volume. LEAST clamps anything above that.
    engagement = LEAST(ln(1 + sub.raw) / ln(26.0), 1.0)
  FROM (
    SELECT
      po.id,
      po.created_at,
      (
        -- distinct engagers (like OR vote OR comment) …
        (SELECT COUNT(DISTINCT u) FROM (
           SELECT pl.user_id AS u FROM post_likes pl
             WHERE pl.post_id = po.id
               AND pl.created_at > NOW() - INTERVAL '48 hours'
           UNION
           SELECT pv.user_id FROM poll_votes pv
             WHERE pv.poll_id = po.id
               AND pv.created_at > NOW() - INTERVAL '48 hours'
           UNION
           SELECT pc.author_id FROM post_comments pc
             WHERE pc.post_id = po.id
               AND pc.deleted_at IS NULL
               AND pc.created_at > NOW() - INTERVAL '48 hours'
         ) e)
        -- … plus distinct commenters again, so a comment is worth two.
        + (SELECT COUNT(DISTINCT pc2.author_id) FROM post_comments pc2
             WHERE pc2.post_id = po.id
               AND pc2.deleted_at IS NULL
               AND pc2.created_at > NOW() - INTERVAL '48 hours')
      )::FLOAT AS raw
    FROM posts po
    WHERE po.hidden = FALSE
      AND po.created_at > NOW() - INTERVAL '30 days'
  ) sub
  WHERE p.id = sub.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Populate immediately rather than waiting up to 10 minutes for the cron.
SELECT refresh_post_scores();
