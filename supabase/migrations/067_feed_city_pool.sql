-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: build_feed_session's same-city rung never admits anyone, because
-- profiles.city is never written.
--
-- 066 tightened 062's `p.city IS NOT DISTINCT FROM v_city` (which treats NULL
-- as equal to NULL) to `p.city = v_city AND v_city IS NOT NULL`, reasoning
-- that NULL-matching was a junk-drawer condition. That reasoning assumed
-- profiles.city gets populated somewhere. It does not: grep every write path
-- (app/profile/edit.tsx's updateProfile call, app/profile/settings.tsx's
-- ghost-mode toggle, src/services/auth.service.ts) and city is never in the
-- updates object. It is read everywhere — post authoring, profile display,
-- search — and set nowhere. v_city is therefore NULL for every viewer in
-- production, `same_city` is always false, and tier 1 has silently collapsed
-- to own posts + friends' posts + whatever clears the cross-city KYC-and-
-- 3-engagers gate. 062's NULL-matching was accidentally load-bearing: it was
-- the only thing putting strangers' posts in front of anyone.
--
-- This is a live regression against production, not a design change, so the
-- fix is narrow: split pool MEMBERSHIP from locality SCORING. Scoring keeps
-- 066's tightened, real-match-only definition (same_city, unchanged, still
-- worth W_LOCAL) — nobody should earn the locality weight for a phantom
-- match. Membership gets its own predicate, in_local_pool, which admits
-- everyone when the viewer has no city, exactly as same_city used to via
-- NULL-matching, but expressed as intent instead of as a side effect of an
-- equality operator. A companion app change (persisting a reverse-geocoded
-- city on the profile) is landing separately; once that ships, in_local_pool
-- degrades toward real locality on its own as v_city stops being NULL for
-- most viewers.
--
-- Everything else in build_feed_session — the three fixes 066 shipped after
-- review (own-post seen-filter exemption, COALESCE'd is_pinned, the
-- double-clamped recency exp()) — is carried over verbatim.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

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
      AND pool.a_kyc = 'approved'
      AND pool.created_at < NOW() - INTERVAL '30 minutes'
      AND pool.engagers_48h >= 3
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
