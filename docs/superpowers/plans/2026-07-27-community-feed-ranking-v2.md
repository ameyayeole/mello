# Community Feed Ranking v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the community feed's hard-tier weighted-sum ranking with a per-session ranked snapshot — normalised weighted signals, a diversity re-rank, seen-post filtering, an own-post pin, and an endless tail that widens the candidate pool.

**Architecture:** Ranking moves from "score at read time, paginate by keyset" to "rank once into a frozen array of post ids, paginate by slicing it." `build_feed_session()` scores the whole candidate pool, applies a greedy author/type diversity re-rank, prepends pinned own posts, and stores the result in `feed_sessions`. `community_feed_page()` hydrates a slice. Both are SECURITY INVOKER, so `posts` RLS keeps enforcing visibility and blocks.

**Tech Stack:** Postgres 15 / Supabase (PL/pgSQL, RLS, pg_cron), React Native + Expo SDK 56, TanStack Query v5, Jest + jest-expo, Zustand.

**Spec:** `docs/superpowers/specs/2026-07-27-community-feed-ranking-design.md`

## Global Constraints

- **There is no local Supabase, no Supabase CLI, and no SQL test runner.** Migrations are applied by pasting the whole file into the Supabase SQL editor. Every migration file must be idempotent and safe to paste whole, and must open with the house comment block ending in "Run this whole file in the Supabase SQL editor."
- **SQL is verified by `pg_temp.checkN()` scripts**, following `supabase/check3_attendee_preview_behaviour.sql`: seed fixtures, collect results into local variables, end the block with `RAISE EXCEPTION` so every write rolls back. Local variables survive the rollback. Safe against production. Returns a `verdict` column that must read `PASS`.
- **Jest only covers `src/**/__tests__/**/*.test.ts?(x)`** — `utils/`, `services/` and hooks. Component tests do not exist (Reanimated 4 throws on import under Jest). Logic that needs testing must be extracted into a plain factory, as `participationMutations` is in `useEventParticipation.ts`.
- **Verification baselines that must not regress:** `npm run typecheck` must stay at 0. `npm test` must stay green. `npm run lint` has 95 pre-existing errors / 16 warnings — do not add to them.
- **Never hardcode a colour** — use `COLORS` from `@/constants/colors`. **Never hardcode a font family** — use `FONTS`. New UI uses a `TYPE`/`TYPE_SIZE` step.
- **Query keys live in `src/constants/queryKeys.ts`.** A hand-typed key fails silently.
- **Weights are `CONSTANT` declarations in one commented block** at the top of `build_feed_session`, never inlined into the score expression.
- **Post types are `photo | shared_wrap | poll | text`** — the image type is `photo`, not `image`.
- **Commit message trailer:** every commit ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Branch:** work continues on `feat/community-feed`.

---

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `supabase/migrations/064_post_scoring_v2.sql` | `refresh_post_scores` v2 + `posts.engagement` column |
| `supabase/migrations/065_post_impressions.sql` | `post_impressions` table, RLS, `record_impressions`, prune cron |
| `supabase/migrations/066_feed_sessions.sql` | `feed_sessions`, `build_feed_session`, `community_feed_page` |
| `supabase/migrations/067_feed_tiers.sql` | Tier 2 pool widening; drops `community_feed`, `posts.score`, `posts.hot_since` |
| `supabase/check4_feed_ranking.sql` | Ranking order + diversity + pin + seen verification |
| `src/services/community/impressions.service.ts` | The `record_impressions` RPC wrapper — one responsibility, kept out of the already-large `posts.service.ts` |
| `src/services/community/__tests__/impressions.service.test.ts` | Its tests |
| `src/hooks/useImpressionTracker.ts` | Viewability buffer + flush. Exports a pure `createImpressionBuffer` factory so the logic is testable without a renderer |
| `src/hooks/__tests__/useImpressionTracker.test.ts` | Buffer/flush tests |
| `docs/testing/community-feed-ranking-v2.md` | Device test sheet — the only coverage for the visual and silent failure modes |

**Modified:**

| File | Change |
| --- | --- |
| `src/services/community/posts.service.ts` | `FeedCursor` → `FeedPageParam`; `getCommunityFeed` calls `community_feed_page` |
| `src/hooks/useCommunityFeed.ts` | `nextCommunityCursor` → `nextFeedPage`, offset/tier driven |
| `src/hooks/__tests__/useCommunityFeed.test.ts` | Rewritten for `nextFeedPage` |
| `src/services/community/__tests__/posts.service.test.ts` | Updated `getCommunityFeed` expectations |
| `src/types/models.ts` | `CommunityPost` gains `session_id` / `session_total` |
| `app/(tabs)/community.tsx` | Dedupe by id, viewability wiring, pull-to-refresh reset, caught-up marker |
| `src/hooks/useUserPosts.ts` | Import fix — it currently imports `nextCommunityCursor` from `useCommunityFeed` |
| `src/components/community/ComposePostSheet.tsx` | Add an `onPosted` prop — `onClose` fires on dismiss too, so it cannot signal "published" |

---

# PHASE 1 — Scoring base v2

### Task 1: Migration 064 — engagement sub-score

**Why a new column instead of repurposing `score`:** the live `community_feed` (062) adds `+100`/`+50` to `posts.score`. If that column suddenly ranged 0–1, the feed would collapse into pure tier ordering with no ranking inside a tier. So v2 writes **both** — the old composite into `score` (keeping 062 working, now with polls counted) and the new normalised value into `engagement` (which Phase 3 reads).

**Files:**
- Create: `supabase/migrations/064_post_scoring_v2.sql`

**Interfaces:**
- Consumes: `posts`, `post_likes`, `post_comments`, `poll_votes` (note: `poll_votes.poll_id` *is* the post id — `polls.post_id` is the PK).
- Produces: `posts.engagement FLOAT NOT NULL DEFAULT 0`, in `[0,1]`. Read by `build_feed_session` in Task 7.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- POST SCORING v2. Adds posts.engagement — the normalised 0–1 engagement
-- sub-score that the v2 feed ranker (066) weights at 20 of ~110.
--
-- Two changes to what counts as engagement:
--   • poll votes count. They never did, so a poll with 40 votes and no likes
--     scored as dead.
--   • commenters count twice. A comment is a stronger signal than a tap.
--
-- refresh_post_scores keeps writing the OLD composite into posts.score as well,
-- because community_feed (062) is still live and adds +100/+50 to it. Swapping
-- that column to a 0–1 scale would collapse the current feed into pure tier
-- order. 067 drops posts.score once nothing reads it.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS engagement FLOAT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION refresh_post_scores()
RETURNS void AS $$
BEGIN
  UPDATE posts p SET
    -- Old composite: freshness + velocity. Still read by community_feed (062).
    score = 6.0 * exp(GREATEST(
              -EXTRACT(EPOCH FROM (NOW() - sub.created_at)) / 172800.0, -700.0))
            + 10.0 * ln(1 + sub.raw),
    -- New: normalised to 0–1. ln(26) saturates at 25 weighted engagers, which
    -- is generous at Mello's volume. LEAST clamps anything above that.
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
```

- [ ] **Step 2: Apply it**

Paste the whole file into the Supabase SQL editor and run. Expected: `ALTER TABLE`, `CREATE FUNCTION`, then one `refresh_post_scores` row.

- [ ] **Step 3: Verify polls now score**

Run in the SQL editor:

```sql
SELECT p.id, p.type, p.engagement, p.score,
       (SELECT COUNT(*) FROM poll_votes v WHERE v.poll_id = p.id) AS votes
FROM posts p
WHERE p.type = 'poll' AND p.hidden = FALSE
ORDER BY votes DESC
LIMIT 10;
```

Expected: any poll with votes in the last 48h has `engagement > 0`. Before this migration every one of them had `score` driven only by freshness. If there are no polls with recent votes in the database, cast a vote on a test poll from the app first, wait for the cron or re-run `SELECT refresh_post_scores();`, and re-check.

- [ ] **Step 4: Confirm the cron still holds the function**

```sql
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'refresh-post-scores';
```

Expected: one row, `*/10 * * * *`, `SELECT refresh_post_scores()`. `CREATE OR REPLACE` keeps the schedule — this step is confirming that, not changing it.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/064_post_scoring_v2.sql
git commit -m "feat(community): add posts.engagement, count poll votes in scoring

refresh_post_scores now counts poll votes and weights commenters 2x, and
writes a normalised 0-1 engagement sub-score alongside the existing
composite. posts.score keeps its old shape because community_feed (062)
still adds +100/+50 to it; 067 drops it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# PHASE 2 — Impressions collector

Ships **before** its consumer, so seen-filtering has real data the day it turns on in Phase 3 rather than filtering nothing for a week. Phase 2 changes no ranking.

### Task 2: Migration 065 — `post_impressions`

**Files:**
- Create: `supabase/migrations/065_post_impressions.sql`

**Interfaces:**
- Produces: table `post_impressions(user_id, post_id, views, last_seen_at)`; RPC `record_impressions(p_post_ids UUID[]) RETURNS void`. Read by Task 7, called by Task 3.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- POST IMPRESSIONS: what each viewer has already been shown, so the v2 feed
-- ranker (066) can filter out posts you have seen three times.
--
-- Shipped one phase AHEAD of the ranker that reads it, so the seen filter has
-- real data on the day it turns on instead of suppressing nothing for a week.
-- Nothing reads this table yet.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS post_impressions (
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id      UUID NOT NULL REFERENCES posts(id)    ON DELETE CASCADE,
  views        INT  NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Doubles as the lookup index for the feed build's NOT EXISTS join.
  PRIMARY KEY (user_id, post_id)
);

ALTER TABLE post_impressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_impressions_select" ON post_impressions;
CREATE POLICY "post_impressions_select" ON post_impressions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "post_impressions_insert" ON post_impressions;
CREATE POLICY "post_impressions_insert" ON post_impressions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "post_impressions_update" ON post_impressions;
CREATE POLICY "post_impressions_update" ON post_impressions
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Batch-record a flush of viewed post ids for the calling user.
--
-- SELECT DISTINCT is load-bearing, not tidiness: ON CONFLICT DO UPDATE raises
-- "cannot affect row a second time" if the same id appears twice in one
-- statement, and the client buffer can legitimately hold a duplicate when a
-- post re-enters the viewport during a flush window.
--
-- The 5-minute WHERE guard is also load-bearing. Without it, scrolling up and
-- down over one post inflates it to "seen three times" in seconds and filters
-- out content the user barely glanced at. A skipped update is a no-op, not an
-- error.
CREATE OR REPLACE FUNCTION record_impressions(p_post_ids UUID[])
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO post_impressions (user_id, post_id)
  SELECT DISTINCT auth.uid(), pid
    FROM unnest(p_post_ids) AS pid
   WHERE auth.uid() IS NOT NULL
  ON CONFLICT (user_id, post_id) DO UPDATE
    SET views        = post_impressions.views + 1,
        last_seen_at = NOW()
    WHERE post_impressions.last_seen_at < NOW() - INTERVAL '5 minutes';
$$;

-- Housekeeping for the feed's viewer-scoped tables. Hourly is plenty — nothing
-- breaks if a prune is missed, it just uses more disk.
CREATE OR REPLACE FUNCTION prune_feed_data()
RETURNS void AS $$
BEGIN
  DELETE FROM post_impressions WHERE last_seen_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  PERFORM cron.unschedule('prune-feed-data');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('prune-feed-data', '7 * * * *', $$SELECT prune_feed_data()$$);
```

- [ ] **Step 2: Apply it**

Paste the whole file into the Supabase SQL editor and run.

- [ ] **Step 3: Verify the guard behaves**

Run this as a single script in the SQL editor. It writes nothing — the `RAISE EXCEPTION` rolls everything back.

```sql
DO $$
DECLARE
  v_user UUID;
  v_post UUID;
  v_views INT;
BEGIN
  SELECT id INTO v_user FROM profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO v_post FROM posts    ORDER BY created_at LIMIT 1;

  -- Direct inserts, because record_impressions() reads auth.uid() and there is
  -- no JWT in a SQL-editor session.
  INSERT INTO post_impressions (user_id, post_id) VALUES (v_user, v_post)
  ON CONFLICT (user_id, post_id) DO UPDATE
    SET views = post_impressions.views + 1, last_seen_at = NOW()
    WHERE post_impressions.last_seen_at < NOW() - INTERVAL '5 minutes';

  -- Immediate second write: must be SKIPPED by the 5-minute guard.
  INSERT INTO post_impressions (user_id, post_id) VALUES (v_user, v_post)
  ON CONFLICT (user_id, post_id) DO UPDATE
    SET views = post_impressions.views + 1, last_seen_at = NOW()
    WHERE post_impressions.last_seen_at < NOW() - INTERVAL '5 minutes';

  SELECT views INTO v_views FROM post_impressions
   WHERE user_id = v_user AND post_id = v_post;

  RAISE EXCEPTION 'views=% (expected 1 — the 5-minute guard must skip the second write)', v_views;
END $$;
```

Expected: the raised message reads `views=1`. If it reads `views=2` the guard is not working — stop and fix before continuing.

- [ ] **Step 4: Verify both cron jobs exist**

```sql
SELECT jobname, schedule FROM cron.job ORDER BY jobname;
```

Expected: `prune-feed-data` at `7 * * * *` and `refresh-post-scores` at `*/10 * * * *`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/065_post_impressions.sql
git commit -m "feat(community): add post_impressions + record_impressions RPC

Collector only — nothing reads it until 066. Ships a phase early so the
seen filter has real data the day it turns on.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `impressions.service.ts`

**Files:**
- Create: `src/services/community/impressions.service.ts`
- Test: `src/services/community/__tests__/impressions.service.test.ts`

**Interfaces:**
- Consumes: `record_impressions` RPC from Task 2.
- Produces: `recordImpressions(postIds: string[]): Promise<void>` — resolves silently on empty input **and swallows RPC errors**. Called by Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/services/community/__tests__/impressions.service.test.ts`:

```ts
import { recordImpressions } from '../impressions.service';
import { supabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

describe('recordImpressions', () => {
  it('sends the ids to the record_impressions RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });
    await recordImpressions(['p1', 'p2']);
    expect(supabase.rpc).toHaveBeenCalledWith('record_impressions', {
      p_post_ids: ['p1', 'p2'],
    });
  });

  it('does not call the RPC for an empty batch', async () => {
    await recordImpressions([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  // Impression recording is fire-and-forget telemetry. A failure here must
  // never surface as a feed error or an unhandled rejection.
  it('swallows an RPC error', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    await expect(recordImpressions(['p1'])).resolves.toBeUndefined();
  });

  it('swallows a thrown network error', async () => {
    (supabase.rpc as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(recordImpressions(['p1'])).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/services/community/__tests__/impressions.service.test.ts`
Expected: FAIL — `Cannot find module '../impressions.service'`.

- [ ] **Step 3: Write the implementation**

Create `src/services/community/impressions.service.ts`:

```ts
import { supabase } from '@/services/supabase';

/**
 * Record that the viewer has seen these posts. The v2 feed ranker filters out
 * anything seen three times (migration 066).
 *
 * Deliberately swallows every failure. This is fire-and-forget telemetry
 * flushed on a timer from a scroll handler: there is no UI waiting on it, and
 * letting it reject would surface a network blip as a feed error — or worse, an
 * unhandled rejection from the interval that fires it.
 *
 * The RPC reads auth.uid() for the viewer, so no user id is passed.
 */
export async function recordImpressions(postIds: string[]): Promise<void> {
  if (postIds.length === 0) return;
  try {
    await supabase.rpc('record_impressions', { p_post_ids: postIds });
  } catch {
    // Intentionally ignored — see above.
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx jest src/services/community/__tests__/impressions.service.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/services/community/impressions.service.ts src/services/community/__tests__/impressions.service.test.ts
git commit -m "feat(community): add recordImpressions service

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `useImpressionTracker`

The buffering logic is extracted into a plain `createImpressionBuffer` factory so it can be driven without a renderer — the same pattern as `participationMutations` in `useEventParticipation.ts`. The hook is a thin wrapper around it.

**Files:**
- Create: `src/hooks/useImpressionTracker.ts`
- Test: `src/hooks/__tests__/useImpressionTracker.test.ts`

**Interfaces:**
- Consumes: `recordImpressions` from Task 3.
- Produces:
  - `createImpressionBuffer(flush: (ids: string[]) => void)` → `{ add(id: string): void; drain(): void; size(): number }`
  - `useImpressionTracker()` → `{ onViewableItemsChanged, viewabilityConfig }`, both referentially stable, ready to spread onto a `FlatList`. Used by Task 5.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useImpressionTracker.test.ts`:

```ts
import { createImpressionBuffer } from '../useImpressionTracker';

describe('createImpressionBuffer', () => {
  it('collects ids and hands them to flush on drain', () => {
    const flush = jest.fn();
    const buf = createImpressionBuffer(flush);
    buf.add('p1');
    buf.add('p2');
    buf.drain();
    expect(flush).toHaveBeenCalledWith(['p1', 'p2']);
  });

  // The server dedupes too (SELECT DISTINCT), but sending one id twice in a
  // batch is pure waste on a mobile connection.
  it('deduplicates within a batch', () => {
    const flush = jest.fn();
    const buf = createImpressionBuffer(flush);
    buf.add('p1');
    buf.add('p1');
    buf.drain();
    expect(flush).toHaveBeenCalledWith(['p1']);
  });

  it('does not call flush when the buffer is empty', () => {
    const flush = jest.fn();
    createImpressionBuffer(flush).drain();
    expect(flush).not.toHaveBeenCalled();
  });

  it('clears after draining, so a second drain is a no-op', () => {
    const flush = jest.fn();
    const buf = createImpressionBuffer(flush);
    buf.add('p1');
    buf.drain();
    buf.drain();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  // A post seen, flushed, then seen again later is a genuine second view.
  it('accepts an id again after it has been drained', () => {
    const flush = jest.fn();
    const buf = createImpressionBuffer(flush);
    buf.add('p1');
    buf.drain();
    buf.add('p1');
    buf.drain();
    expect(flush).toHaveBeenNthCalledWith(2, ['p1']);
  });

  it('reports its size', () => {
    const buf = createImpressionBuffer(jest.fn());
    expect(buf.size()).toBe(0);
    buf.add('p1');
    buf.add('p1');
    expect(buf.size()).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/hooks/__tests__/useImpressionTracker.test.ts`
Expected: FAIL — `Cannot find module '../useImpressionTracker'`.

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useImpressionTracker.ts`:

```ts
import { useCallback, useEffect, useRef } from 'react';
import type { ViewToken } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { recordImpressions } from '@/services/community/impressions.service';

const FLUSH_MS = 5000;

// 60% of a card on screen for a full second counts as seen. Lower thresholds
// count posts that merely flew past during a fast scroll.
export const IMPRESSION_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 60,
  minimumViewTime: 1000,
} as const;

/**
 * The buffering half of impression tracking, as a plain factory so it can be
 * driven in a test without a renderer (Reanimated 4 throws on import under
 * Jest, so there are no component tests — see AGENTS.md).
 */
export function createImpressionBuffer(flush: (ids: string[]) => void) {
  let pending = new Set<string>();

  return {
    add(id: string) {
      pending.add(id);
    },
    drain() {
      if (pending.size === 0) return;
      const ids = Array.from(pending);
      pending = new Set();
      flush(ids);
    },
    size() {
      return pending.size;
    },
  };
}

/**
 * Feeds the community FlatList's viewability events into `post_impressions`.
 *
 * Spread the result onto the list. Both returned values are referentially
 * stable on purpose: React Native throws "Changing onViewableItemsChanged on
 * the fly is not supported", and the Community screen re-renders constantly.
 *
 * Flushing deliberately does NOT invalidate the feed query. It is
 * fire-and-forget; invalidating would rebuild the ranked session and reorder
 * the feed under the user's thumb.
 */
export function useImpressionTracker() {
  const bufferRef = useRef(createImpressionBuffer(recordImpressions));

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      for (const token of viewableItems) {
        const id = (token.item as { id?: string } | undefined)?.id;
        if (token.isViewable && id) bufferRef.current.add(id);
      }
    }
  ).current;

  const viewabilityConfig = useRef(IMPRESSION_VIEWABILITY_CONFIG).current;

  useEffect(() => {
    const timer = setInterval(() => bufferRef.current.drain(), FLUSH_MS);
    return () => {
      clearInterval(timer);
      bufferRef.current.drain(); // don't lose the tail on unmount
    };
  }, []);

  // Leaving the tab is the strongest "this scroll session is over" signal.
  const buffer = bufferRef;
  useFocusEffect(
    useCallback(() => {
      return () => buffer.current.drain();
    }, [buffer])
  );

  return { onViewableItemsChanged, viewabilityConfig };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx jest src/hooks/__tests__/useImpressionTracker.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck
npx eslint src/hooks/useImpressionTracker.ts
git add src/hooks/useImpressionTracker.ts src/hooks/__tests__/useImpressionTracker.test.ts
git commit -m "feat(community): add useImpressionTracker

Buffering logic lives in a plain createImpressionBuffer factory so it is
testable without a renderer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire the tracker into the Community screen

**Files:**
- Modify: `app/(tabs)/community.tsx`

**Interfaces:**
- Consumes: `useImpressionTracker` from Task 4.
- Produces: nothing new. Impressions begin accumulating in production.

- [ ] **Step 1: Add the import**

In the import block of `app/(tabs)/community.tsx`, alongside the other `@/hooks` imports:

```ts
import { useImpressionTracker } from '@/hooks/useImpressionTracker';
```

- [ ] **Step 2: Call the hook**

Immediately after `const feed = useCommunityFeed();` (line 45):

```ts
  // Records what the viewer actually sees, so the ranker can stop re-serving
  // posts they have already scrolled past (migration 065/066).
  const impressions = useImpressionTracker();
```

- [ ] **Step 3: Spread it onto the FlatList**

On the `<FlatList>`, immediately after the `onScroll` prop:

```tsx
            onViewableItemsChanged={impressions.onViewableItemsChanged}
            viewabilityConfig={impressions.viewabilityConfig}
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck && npm test
```

Expected: typecheck 0 errors, tests green.

- [ ] **Step 5: Verify on a device**

Work through **section C — Phase 2** of `docs/testing/community-feed-ranking-v2.md` (Task 15) on iOS and Android. Seven rows, covering dwell time, the 5-minute guard, the blur flush, and — importantly — that ranking is unchanged, since 065 must be invisible to the user.

- [ ] **Step 6: Commit**

```bash
git add "app/(tabs)/community.tsx"
git commit -m "feat(community): record post impressions from the feed list

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# PHASE 3 — Session snapshot ranking

The large phase, and the only one that changes ranking and pagination together — they cannot be separated, because the snapshot *is* the pagination.

### Task 6: Migration 066a — `feed_sessions`

**Files:**
- Create: `supabase/migrations/066_feed_sessions.sql` (this task writes the first section; Tasks 7 and 8 append to the same file)

**Interfaces:**
- Produces: table `feed_sessions(id, user_id, tier, post_ids UUID[], post_scores FLOAT[], created_at)`.

- [ ] **Step 1: Write the table section**

Create `supabase/migrations/066_feed_sessions.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- COMMUNITY FEED v6: per-session ranked snapshot.
--
-- WHY THIS REPLACES THE KEYSET. community_feed (062) paginated by keyset over
-- (score, created_at, id). That score moves — every 10 minutes from the cron,
-- and continuously once recency carries real weight. When a ranking shifts
-- between page fetches, rows cross the page boundary and are duplicated or
-- skipped, silently: no error, no type failure, no lint warning. It is the same
-- failure Bluesky's Discover feed has open against it.
--
-- Instead: rank the whole pool ONCE into a frozen array of post ids, and
-- paginate by slicing it. Duplicates and skips become structurally impossible,
-- and because the whole ordered list is in hand, the diversity re-rank can be
-- exact instead of a window-function approximation that breaks at page seams.
--
-- Both functions are SECURITY INVOKER, so posts' RLS (044) keeps enforcing
-- visibility, friends-only scoping and blocks. Nothing is re-implemented here.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feed_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tier        SMALLINT NOT NULL DEFAULT 1,
  post_ids    UUID[]  NOT NULL,
  -- Parallel to post_ids. Stored so CommunityPost.score keeps its real value
  -- and "why is this post fourth?" is answerable from the row.
  post_scores FLOAT[] NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feed_sessions_user_idx
  ON feed_sessions (user_id, created_at DESC);

ALTER TABLE feed_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_sessions_select" ON feed_sessions;
CREATE POLICY "feed_sessions_select" ON feed_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "feed_sessions_insert" ON feed_sessions;
CREATE POLICY "feed_sessions_insert" ON feed_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- 6 hours, not 1: a session must outlive any plausible scroll, because a page
-- request against a pruned session is a hard error for the user. Six hours of
-- sessions at ~12 KB each is nothing at this scale.
CREATE OR REPLACE FUNCTION prune_feed_data()
RETURNS void AS $$
BEGIN
  DELETE FROM post_impressions WHERE last_seen_at < NOW() - INTERVAL '30 days';
  DELETE FROM feed_sessions    WHERE created_at   < NOW() - INTERVAL '6 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Do not apply yet**

Tasks 7 and 8 append `build_feed_session` and `community_feed_page` to this same file. The file is applied once, whole, at the end of Task 8. Continue to Task 7.

- [ ] **Step 3: Commit the partial migration**

```bash
git add supabase/migrations/066_feed_sessions.sql
git commit -m "feat(community): add feed_sessions table and prune

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Migration 066b — `build_feed_session`

The heart of the change: pool selection, scoring, diversity re-rank, pin.

**Files:**
- Modify: `supabase/migrations/066_feed_sessions.sql` (append)

**Interfaces:**
- Consumes: `posts.engagement` (Task 1), `post_impressions` (Task 2), `feed_sessions` (Task 6).
- Produces: `build_feed_session(p_user_id UUID, p_tier SMALLINT DEFAULT 1, p_pin_own BOOLEAN DEFAULT TRUE) RETURNS UUID` — the new session's id. Called by Task 8.

- [ ] **Step 1: Append the function**

Append to `supabase/migrations/066_feed_sessions.sql`:

```sql
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
      -- Seen filter. No grace window is needed: the snapshot is frozen, so
      -- nothing can vanish from under the user mid-scroll.
      AND NOT EXISTS (
        SELECT 1 FROM post_impressions pi
         WHERE pi.user_id = p_user_id
           AND pi.post_id = p.id
           AND pi.views >= SEEN_LIMIT
      )
  )
  SELECT
    pool.id,
    pool.author_id,
    pool.type,
    pool.created_at,
    (p_pin_own AND pool.is_own
       AND pool.created_at > NOW() - INTERVAL '5 minutes') AS is_pinned,
    (
        W_FRIEND  * CASE WHEN pool.is_friend THEN 1.0 ELSE 0.0 END
      -- Recency quantised to the hour: successive session builds a few minutes
      -- apart then produce near-identical order instead of micro-reshuffling.
      + W_RECENCY * exp(GREATEST(
          -floor(EXTRACT(EPOCH FROM (NOW() - pool.created_at)) / 3600.0) / 24.0,
          -700.0))
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
    pool.is_own OR pool.is_friend OR pool.same_city
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
```

- [ ] **Step 2: Do not apply yet**

Task 8 appends the reader to this same file. Continue to Task 8.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/066_feed_sessions.sql
git commit -m "feat(community): add build_feed_session ranker

Normalised weighted scoring, greedy author/type diversity re-rank with a
lookahead bound, own-post pin, seen filter.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Migration 066c — `community_feed_page`

**Files:**
- Modify: `supabase/migrations/066_feed_sessions.sql` (append)

**Interfaces:**
- Consumes: `build_feed_session` (Task 7).
- Produces: `community_feed_page(p_user_id, p_session_id, p_tier, p_pin_own, p_offset, p_limit)` returning the `CommunityPost` columns plus `session_id UUID` and `session_total INT`. Called by Task 10.

- [ ] **Step 1: Append the function**

Append to `supabase/migrations/066_feed_sessions.sql`:

```sql
-- ─── community_feed_page ─────────────────────────────────────────────────────
-- Hydrates one slice of a session. p_session_id NULL builds a session first, so
-- a cold start is ONE round trip rather than two.
--
-- session_total is returned on every row because a short page here does NOT
-- mean the end of the feed: this is SECURITY INVOKER, so a post hidden,
-- deleted or blocked since the snapshot was taken silently drops out of its
-- slice. Paging must be driven by offset against session_total — the old
-- `lastPage.length < PAGE_SIZE` heuristic would truncate the feed at the first
-- moderated post.
CREATE OR REPLACE FUNCTION community_feed_page(
  p_user_id    UUID,
  p_session_id UUID     DEFAULT NULL,
  p_tier       SMALLINT DEFAULT 1,
  p_pin_own    BOOLEAN  DEFAULT TRUE,
  p_offset     INT      DEFAULT 0,
  p_limit      INT      DEFAULT 10
)
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
  score             FLOAT,
  session_id        UUID,
  session_total     INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_session UUID := p_session_id;
  v_ids     UUID[];
  v_scores  FLOAT[];
  v_total   INT;
BEGIN
  IF v_session IS NULL THEN
    v_session := build_feed_session(p_user_id, p_tier, p_pin_own);
  END IF;

  SELECT fs.post_ids, fs.post_scores
    INTO v_ids, v_scores
    FROM feed_sessions fs
   WHERE fs.id = v_session AND fs.user_id = p_user_id;

  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'feed session % not found or expired', v_session
      USING ERRCODE = 'no_data_found';
  END IF;

  v_total := COALESCE(array_length(v_ids, 1), 0);

  RETURN QUERY
  SELECT
    p.id, p.author_id, pr.name, pr.photo_url, p.type, p.visibility,
    p.body, p.media, p.city, p.like_count, p.comment_count, p.created_at,
    EXISTS (SELECT 1 FROM post_likes pl
             WHERE pl.post_id = p.id AND pl.user_id = p_user_id) AS liked_by_me,
    p.comments_enabled,
    p.ref_wrap_event_id,
    slice.sc,
    v_session,
    v_total
  FROM unnest(
         v_ids[p_offset + 1 : p_offset + p_limit],
         v_scores[p_offset + 1 : p_offset + p_limit]
       ) WITH ORDINALITY AS slice(pid, sc, ord)
  JOIN posts    p  ON p.id = slice.pid AND p.hidden = FALSE
  JOIN profiles pr ON pr.id = p.author_id
  ORDER BY slice.ord;
END;
$$;
```

- [ ] **Step 2: Apply the whole file**

Paste all of `supabase/migrations/066_feed_sessions.sql` into the Supabase SQL editor and run. Expected: `CREATE TABLE`, `CREATE INDEX`, three policies, three `CREATE FUNCTION`.

- [ ] **Step 3: Smoke-test it**

```sql
SELECT id, type, score, session_total
FROM community_feed_page(
  (SELECT id FROM profiles ORDER BY created_at LIMIT 1)::UUID,
  NULL, 1::SMALLINT, TRUE, 0, 10
);
```

Expected: up to 10 rows, `score` descending-ish (diversity permutes it), the same `session_total` on every row. **This runs as the SQL-editor role with no JWT, so `auth.uid()` is NULL and RLS on `posts` will return nothing** — if you get zero rows here, that is expected and not a failure. Task 9's check script is what actually verifies behaviour, and Step 5 verifies it end to end from the app.

- [ ] **Step 4: Confirm a session row was written**

```sql
SELECT id, tier, array_length(post_ids, 1) AS n, created_at
FROM feed_sessions ORDER BY created_at DESC LIMIT 3;
```

Expected: at least one row from Step 3.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/066_feed_sessions.sql
git commit -m "feat(community): add community_feed_page snapshot reader

One round trip on cold start; returns session_total so a short page (from
a post moderated mid-session) is not mistaken for the end of the feed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: `check4_feed_ranking.sql`

The real coverage for the ranking. Follows `check3_attendee_preview_behaviour.sql` exactly: seed, assert, `RAISE EXCEPTION` to roll everything back.

**Files:**
- Create: `supabase/check4_feed_ranking.sql`

**Interfaces:**
- Consumes: `build_feed_session`, `feed_sessions`.
- Produces: nothing. A verification artifact.

- [ ] **Step 1: Write the check script**

Create `supabase/check4_feed_ranking.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 4 · Does `build_feed_session` rank, diversify and pin correctly?
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor and hit run.
-- Read the `verdict` column — every row must say PASS.
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
```

- [ ] **Step 2: Run it**

Paste the whole file into the Supabase SQL editor.
Expected: eleven rows, every `verdict` reading `PASS`. Row 8 and 9 read `SKIP` if the database has fewer than three profiles — seed a third and re-run rather than accepting the skip, because **row 9 is the assertion that guards the entire redesign**: it is what fails if the weights ever drift back into a hard tier.

| # | Asserts |
| --- | --- |
| 1 | A photo outranks an equally fresh text post |
| 2 | Two photos from one author are not adjacent |
| 3 | A post seen 3× is filtered out |
| 4 | A post seen 2× is still served |
| 5 | An own post <5 min old pins to position 1 |
| 6 | …and does not pin when `p_pin_own` is false |
| 7 | The pin survives the diversity re-rank |
| 8 | A friend outranks a stranger, all else equal |
| 9 | **A stale friend post loses to a fresh engaged local one** |
| 10 | Same-city outranks cross-city |
| 11 | Tier 2 widens the pool rather than replacing it |

If any row FAILs, fix `build_feed_session` (Task 7) before continuing — the client work in Tasks 10-12 assumes this ranking is correct.

- [ ] **Step 3: Record the result in the header**

Update the header comment with the date and result, matching check3's convention:

```sql
-- LAST RUN: 2026-07-27 against production — 11/11 PASS.
```

- [ ] **Step 4: Commit**

```bash
git add supabase/check4_feed_ranking.sql
git commit -m "test(community): add check4 for feed ranking order

Eleven assertions over media weight, author/type diversity, the seen
threshold in both directions, the pin in both states and against the
re-rank, friendship, locality and tier widening. Row 9 is the one that
guards the redesign: a stale friend post must lose to a fresh engaged
local one, which is what fails if the weights drift back into a hard tier.
Order is the contract, not scores.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Swap `posts.service` to the page RPC

**Files:**
- Modify: `src/services/community/posts.service.ts:4-23`
- Modify: `src/types/models.ts` (`CommunityPost`)
- Test: `src/services/community/__tests__/posts.service.test.ts`

**Interfaces:**
- Consumes: `community_feed_page` (Task 8).
- Produces: `export type FeedPageParam = { sessionId: string | null; tier: number; offset: number }`, and `getCommunityFeed({ userId, page, pinOwn, limit })`. Used by Task 11.

**Why `pinOwn` is a sibling of `page`, not a field inside it.** The pin is a property of *this request*, not of the reader's position — it answers "did the viewer just post, or did they just ask for a refresh?". Keeping it out of the page param means `nextFeedPage` never has to carry it, and the hook can read it at call time from a ref (Task 11), which is what makes the pull-to-refresh release work at all.

- [ ] **Step 1: Write the failing test**

Replace the `getCommunityFeed` describe block in `src/services/community/__tests__/posts.service.test.ts`:

```ts
describe('getCommunityFeed', () => {
  const page = (o = {}) => ({ sessionId: null, tier: 1, offset: 0, ...o });

  it('builds a new session and pins on the first page', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getCommunityFeed({ userId: 'u1', page: page(), pinOwn: true, limit: 10 });
    expect(supabase.rpc).toHaveBeenCalledWith('community_feed_page', {
      p_user_id: 'u1',
      p_session_id: null,
      p_tier: 1,
      p_pin_own: true,
      p_offset: 0,
      p_limit: 10,
    });
  });

  // The pull-to-refresh release: same build, pinning explicitly off.
  it('does not pin when pinOwn is false', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getCommunityFeed({ userId: 'u1', page: page(), pinOwn: false, limit: 10 });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'community_feed_page',
      expect.objectContaining({ p_pin_own: false })
    );
  });

  it('reuses the session and advances the offset on later pages', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getCommunityFeed({
      userId: 'u1',
      page: page({ sessionId: 's1', offset: 10 }),
      pinOwn: true,
      limit: 10,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('community_feed_page', {
      p_user_id: 'u1',
      p_session_id: 's1',
      p_tier: 1,
      // Pinning is decided when the session is BUILT. A continuation page has
      // nothing to pin, so forwarding true here would be misleading noise.
      p_pin_own: false,
      p_offset: 10,
      p_limit: 10,
    });
  });

  // A tier advance builds a fresh session, so sessionId is null — but the tail
  // of the feed is never the right place for your own post to reappear on top.
  it('does not pin when building a session for tier 2', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getCommunityFeed({
      userId: 'u1',
      page: page({ tier: 2 }),
      pinOwn: true,
      limit: 10,
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'community_feed_page',
      expect.objectContaining({ p_tier: 2, p_pin_own: false })
    );
  });

  it('throws on rpc error', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    await expect(
      getCommunityFeed({ userId: 'u1', page: page(), pinOwn: true })
    ).rejects.toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/services/community/__tests__/posts.service.test.ts`
Expected: FAIL — the RPC name is still `community_feed`.

- [ ] **Step 3: Update the type**

In `src/types/models.ts`, in the `CommunityPost` interface, replace the `score` field's comment block and add the two session fields:

```ts
  // Ranking score from the frozen session snapshot (migration 066). Cards
  // ignore it; it is here for debugging "why is this post fourth?".
  score: number;
  // Present only on rows from community_feed_page. Pagination is driven by
  // `offset < session_total`, never by page length — a post moderated
  // mid-session drops out of its slice and shortens the page.
  session_id?: string;
  session_total?: number;
```

- [ ] **Step 4: Update the service**

In `src/services/community/posts.service.ts`, replace lines 4-23:

```ts
// Where the reader is in a ranked session. `sessionId` null means "build a new
// session" — the snapshot is the pagination (migration 066), so there is no
// cursor to carry.
export type FeedPageParam = {
  sessionId: string | null;
  tier: number;
  offset: number;
};

// Kept for user_posts / get_post, which still paginate by keyset.
export type FeedCursor = { score: number; createdAt: string; id: string };

export async function getCommunityFeed(params: {
  userId: string;
  page: FeedPageParam;
  // Whether this build should float the viewer's own <5-minute-old posts to the
  // top. Only consulted when a session is actually being built.
  pinOwn: boolean;
  limit?: number;
}): Promise<CommunityPost[]> {
  // Two conditions, both required. A continuation page has nothing to pin, and
  // a tier-2+ build is the tail of the feed — the last place your own post
  // should reappear on top.
  const pinning =
    params.page.sessionId === null && params.page.tier === 1 && params.pinOwn;

  const { data, error } = await supabase.rpc('community_feed_page', {
    p_user_id: params.userId,
    p_session_id: params.page.sessionId,
    p_tier: params.page.tier,
    p_pin_own: pinning,
    p_offset: params.page.offset,
    p_limit: params.limit ?? 10,
  });
  if (error) throw error;
  return (data ?? []) as CommunityPost[];
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx jest src/services/community/__tests__/posts.service.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: errors only in `useCommunityFeed.ts` (still calling the old signature). Task 11 fixes those. If `useUserPosts.ts` errors, it is because it imports `nextCommunityCursor` — leave it until Task 11.

- [ ] **Step 7: Commit**

```bash
git add src/services/community/posts.service.ts src/services/community/__tests__/posts.service.test.ts src/types/models.ts
git commit -m "feat(community): point getCommunityFeed at community_feed_page

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: `nextFeedPage`

**Files:**
- Modify: `src/hooks/useCommunityFeed.ts`
- Modify: `src/hooks/useUserPosts.ts` (import fix)
- Test: `src/hooks/__tests__/useCommunityFeed.test.ts` (rewritten)

**Interfaces:**
- Consumes: `FeedPageParam` (Task 10).
- Produces: `nextFeedPage(lastPage: CommunityPost[], current: FeedPageParam, pageSize: number): FeedPageParam | undefined`, and `useCommunityFeed(enabled?)`. Used by Task 12.

- [ ] **Step 1: Write the failing test**

Replace `src/hooks/__tests__/useCommunityFeed.test.ts` entirely:

```ts
import { nextFeedPage } from '../useCommunityFeed';
import { CommunityPost } from '@/types/models';

const post = (
  id: string,
  sessionId = 's1',
  sessionTotal = 30
): CommunityPost => ({
  id,
  author_id: 'a',
  author_name: 'A',
  author_photo_url: null,
  type: 'text',
  visibility: 'public',
  body: 'x',
  media: [],
  ref_wrap_event_id: null,
  city: 'Mumbai',
  like_count: 0,
  comment_count: 0,
  liked_by_me: false,
  comments_enabled: true,
  created_at: 't',
  score: 1,
  session_id: sessionId,
  session_total: sessionTotal,
});

const page = (overrides = {}) => ({
  sessionId: 's1',
  tier: 1,
  offset: 0,
  ...overrides,
});

describe('nextFeedPage', () => {
  it('advances the offset while the session has more rows', () => {
    expect(nextFeedPage([post('1')], page(), 10)).toEqual({
      sessionId: 's1',
      tier: 1,
      offset: 10,
    });
  });

  it('adopts the session id returned by a freshly built session', () => {
    const first = page({ sessionId: null });
    expect(nextFeedPage([post('1', 'new-session')], first, 10)).toEqual({
      sessionId: 'new-session',
      tier: 1,
      offset: 10,
    });
  });

  // The critical regression guard. A post moderated mid-session drops out of
  // its slice, so a short page is NOT the end of the feed. Driving pagination
  // off page length (as the old keyset did) truncates the feed silently.
  it('keeps paging after a short page when the session has rows left', () => {
    const shortPage = [post('1'), post('2')]; // 2 rows for a limit of 10
    expect(nextFeedPage(shortPage, page(), 10)).toEqual({
      sessionId: 's1',
      tier: 1,
      offset: 10,
    });
  });

  it('advances to the next tier when the session is exhausted', () => {
    const last = page({ offset: 20 });
    expect(nextFeedPage([post('1', 's1', 30)], last, 10)).toEqual({
      sessionId: null,
      tier: 2,
      offset: 0,
    });
  });

  it('advances the tier when a tier returns nothing at all', () => {
    expect(nextFeedPage([], page({ sessionId: null }), 10)).toEqual({
      sessionId: null,
      tier: 2,
      offset: 0,
    });
  });

  it('ends the feed after the last tier', () => {
    const last = page({ tier: 3, offset: 20 });
    expect(nextFeedPage([post('1', 's1', 30)], last, 10)).toBeUndefined();
  });

  it('ends the feed when the last tier returns nothing', () => {
    expect(
      nextFeedPage([], page({ tier: 3, sessionId: null }), 10)
    ).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest src/hooks/__tests__/useCommunityFeed.test.ts`
Expected: FAIL — `nextFeedPage` is not exported.

- [ ] **Step 3: Rewrite the hook**

Replace `src/hooks/useCommunityFeed.ts` entirely:

```ts
import { MutableRefObject } from 'react';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getCommunityFeed, FeedPageParam } from '@/services/community/posts.service';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';

const PAGE_SIZE = 10;

// Tier 1: own + friends + same city + gated cross-city.
// Tier 2: the cross-city gates dropped — any public post, anywhere.
// Tier 3: nothing left to rank; the screen shows the caught-up marker.
export const LAST_TIER = 3;

/**
 * Where to read next. Pagination is an offset into a frozen ranked snapshot
 * (migration 066), not a cursor — a ranking that moves between page fetches
 * duplicates and skips rows silently, which is exactly what the keyset feed did.
 *
 * Two rules that look like details and are not:
 *
 *  - A SHORT PAGE IS NOT THE END. community_feed_page is SECURITY INVOKER, so a
 *    post hidden, deleted or blocked since the snapshot was taken drops out of
 *    its slice. Paging is driven by offset against session_total. The old
 *    `lastPage.length < PAGE_SIZE` heuristic would end the feed at the first
 *    moderated post.
 *
 *  - AN EMPTY TIER STILL ADVANCES. A viewer with no friends and no city gets an
 *    empty tier 1; ending there is the empty-feed bug the tiers exist to
 *    prevent.
 */
export function nextFeedPage(
  lastPage: CommunityPost[],
  current: FeedPageParam,
  pageSize: number
): FeedPageParam | undefined {
  const sessionId = lastPage[0]?.session_id ?? current.sessionId;
  const total = lastPage[0]?.session_total ?? 0;
  const nextOffset = current.offset + pageSize;

  if (sessionId && nextOffset < total) {
    return { ...current, sessionId, offset: nextOffset };
  }
  if (current.tier < LAST_TIER) {
    return { sessionId: null, tier: current.tier + 1, offset: 0 };
  }
  return undefined;
}

/**
 * @param pinOwnRef Whether the NEXT session build should float the viewer's own
 *   fresh posts to the top. A **ref**, not state, and read inside `queryFn`
 *   rather than baked into `initialPageParam` — both deliberate:
 *
 *   - `initialPageParam` is a static object, so a value captured there could
 *     never change without remounting the query.
 *   - Pull-to-refresh must set it `false` and trigger the rebuild in the same
 *     tick. A `useState` update would not have landed by the time
 *     `resetQueries` reads the options, so the first refresh would still pin.
 *
 *   Refs are mutable and read at call time, which is exactly the semantics
 *   needed. Posting sets it back to `true` (see the Community screen).
 */
export function useCommunityFeed(
  pinOwnRef?: MutableRefObject<boolean>,
  enabled = true
) {
  const user = useAuthStore((s) => s.user);

  return useInfiniteQuery({
    queryKey: queryKeys.community.feed.of(user?.id),
    queryFn: ({ pageParam }) =>
      getCommunityFeed({
        userId: user!.id,
        page: pageParam,
        pinOwn: pinOwnRef?.current ?? true,
        limit: PAGE_SIZE,
      }),
    initialPageParam: {
      sessionId: null,
      tier: 1,
      offset: 0,
    } as FeedPageParam,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      nextFeedPage(lastPage, lastPageParam, PAGE_SIZE),
    enabled: !!user && enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
```

- [ ] **Step 4: Fix the `useUserPosts` import**

`src/hooks/useUserPosts.ts:4` imports `nextCommunityCursor` from `useCommunityFeed`, which no longer exists. The Profile "Posts" tab still paginates by keyset, so move the helper there. Open `src/hooks/useUserPosts.ts`, delete the import line, and add this above the hook:

```ts
// The keyset cursor for the Profile "Posts" tab. Lived in useCommunityFeed
// until the community feed moved to snapshot pagination (migration 066);
// user_posts (057) still paginates by keyset, so it moved here rather than
// being deleted.
function nextCommunityCursor(
  lastPage: CommunityPost[],
  pageSize: number
): FeedCursor | undefined {
  if (lastPage.length < pageSize) return undefined;
  const last = lastPage[lastPage.length - 1];
  return { score: last.score, createdAt: last.created_at, id: last.id };
}
```

Add `CommunityPost` and `FeedCursor` to its existing imports if they are not already there.

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
npx jest src/hooks/__tests__/useCommunityFeed.test.ts
npm test
```

Expected: 7 tests pass in the first; the whole suite green in the second.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/hooks/useCommunityFeed.ts src/hooks/useUserPosts.ts src/hooks/__tests__/useCommunityFeed.test.ts
git commit -m "feat(community): paginate the feed by session offset, not keyset

nextFeedPage drives paging off offset vs session_total so a page shortened
by a mid-session moderation does not end the feed, and advances tier when a
session is exhausted or empty.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Wire the Community screen

**Files:**
- Modify: `app/(tabs)/community.tsx:45` (pin ref), `:65-68` (dedupe), `:103-109` (pull-to-refresh), `:288-291` (compose)
- Modify: `src/components/community/ComposePostSheet.tsx:35-41` (add `onPosted`)

**Interfaces:**
- Consumes: `useCommunityFeed(pinOwnRef)` (Task 11).
- Produces: nothing. Phase 3 becomes visible.

- [ ] **Step 1: Add the pin ref and pass it to the feed**

Replace line 45 (`const feed = useCommunityFeed();`):

```ts
  // Whether the next session build should float your own fresh post to the top.
  //
  // A ref, not state, because the two things that flip it both need it read on
  // the very next query — pull-to-refresh sets it false and rebuilds in the
  // same tick, and a state update would not have landed in time.
  //
  // Posting turns it on; asking for a refresh turns it off. That is the whole
  // rule: refreshing repeatedly inside the 5-minute window should not keep
  // parking your own post at the top.
  const pinOwnRef = useRef(true);
  const feed = useCommunityFeed(pinOwnRef);
```

- [ ] **Step 2: Dedupe the flattened pages**

Replace the `posts` memo at lines 65-68:

```ts
  // Deduped by id, not just flattened. A tier advance rebuilds the pool, so a
  // post that entered it between builds can legitimately be served twice. One
  // line here is robust against every cross-tier case and cannot drift out of
  // sync with the ranking, which a SQL-side fix would.
  const posts = useMemo(() => {
    const seen = new Set<string>();
    return (feed.data?.pages.flat() ?? []).filter((p) =>
      seen.has(p.id) ? false : (seen.add(p.id), true)
    );
  }, [feed.data]);
```

- [ ] **Step 3: Release the pin and rebuild on pull-to-refresh**

Replace the `usePullToRefresh` call at lines 103-109:

```ts
  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    // A manual refresh means the user is looking at the top — adopt whatever
    // comes back and clear any pending pill.
    knownTopId.current = posts[0]?.id ?? null;
    setShowNewPill(false);
    // The gesture half of the pin release. Set BEFORE the rebuild: the ref is
    // read inside queryFn, so the very next request already carries it.
    pinOwnRef.current = false;
    // resetQueries, not refetch. An infinite query's refetch re-runs every
    // LOADED page against its stored pageParam — i.e. against the OLD session
    // id — so the ranking would never change and the pin would never drop.
    // resetQueries discards the pages, returns the query to initialPageParam
    // (a fresh tier-1 session) and refetches it.
    await queryClient.resetQueries({
      queryKey: queryKeys.community.feed.of(meId),
    });
  });
```

`resetQueries` refetches on its own, so the trailing `await refetch()` is gone — leaving it in would fire a second request.

Add the client above it:

```ts
  const queryClient = useQueryClient();
```

and add `useQueryClient` to the existing `@tanstack/react-query` import on line 12, plus `queryKeys` from `@/constants/queryKeys` and `useRef` from `react` if the screen does not already import them.

- [ ] **Step 4: Give `ComposePostSheet` an `onPosted` prop**

The sheet currently calls `onClose()` on both a successful post and a manual dismiss, so the screen cannot tell them apart. Per AGENTS.md the fix is to add the prop, not to fork the component.

In `src/components/community/ComposePostSheet.tsx`, extend the props:

```ts
export function ComposePostSheet({
  visible,
  onClose,
  onPosted,
}: {
  visible: boolean;
  onClose: () => void;
  // Fired only on a successful post — `onClose` also fires on dismiss, so it
  // cannot stand in for "the user actually published something".
  onPosted?: () => void;
}) {
```

and in `submit()`'s `done.onSuccess`, call it before closing:

```ts
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onPosted?.();
        reset();
        onClose();
      },
```

- [ ] **Step 5: Re-arm the pin when the user posts**

In `app/(tabs)/community.tsx`, at the `<ComposePostSheet>` usage (~line 288):

```tsx
      <ComposePostSheet
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        // Posting is the one thing that earns the pin back after a refresh
        // turned it off.
        onPosted={() => {
          pinOwnRef.current = true;
        }}
      />
```

- [ ] **Step 6: Verify**

```bash
npm run typecheck && npm test && npx eslint "app/(tabs)/community.tsx"
```

Expected: typecheck 0, tests green, no new lint errors.

- [ ] **Step 7: Run the Phase 3 device sheet**

Open `docs/testing/community-feed-ranking-v2.md` (Task 15) and work through **section D — Phase 3** on iOS, then on Android. Tick every row. Do not skip Android: `minimumViewTime` behaves differently there and `react-native`'s `SafeAreaView` is a no-op, so this entire class of bug is invisible on iOS.

Phase 3 leaves tier 2 unbuilt, so the feed is expected to stop after one tier advance returns nothing. That is correct at this point — D9 covers it.

- [ ] **Step 8: Commit**

```bash
git add "app/(tabs)/community.tsx" src/components/community/ComposePostSheet.tsx
git commit -m "feat(community): snapshot pagination, dedupe, and the pin release

Pull-to-refresh clears the own-post pin and rebuilds the session; posting
re-arms it. ComposePostSheet gains onPosted because onClose also fires on
dismiss and cannot stand in for 'the user actually published something'.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# PHASE 4 — The endless tail

### Task 13: Migration 067 — tier 2 and cleanup

**Files:**
- Create: `supabase/migrations/067_feed_tiers.sql`

**Interfaces:**
- Modifies: `build_feed_session` to honour `p_tier = 2`.
- Removes: `community_feed`, `posts.score`, `posts.hot_since`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/067_feed_tiers.sql`:

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- FEED TIERS: the endless tail. When a tier's snapshot is exhausted the client
-- builds the next one over a WIDER pool. It never re-serves a seen post —
-- Instagram ships "You're All Caught Up" then Suggested Posts from accounts you
-- do not follow, i.e. a different pool, not a repeat.
--
--   tier 1  own + friends + same city + GATED cross-city (today's pool)
--   tier 2  the same, with the cross-city gates dropped
--   tier 3  handled entirely client-side: the caught-up marker
--
-- Tier 2 deliberately contradicts tier 1's gates. That is the design, not an
-- oversight — do not "fix" it.
--
-- Also drops what the v2 ranker replaced: community_feed (062), posts.score and
-- posts.hot_since. hot_since was written by every version of
-- refresh_post_scores and read by none of them.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Re-created whole, with the tier-aware pool predicate. Only the closing WHERE
-- of the INSERT differs from 066 — everything above it is unchanged, and is
-- reproduced here so this file can be pasted on its own.
CREATE OR REPLACE FUNCTION build_feed_session(
  p_user_id UUID,
  p_tier    SMALLINT DEFAULT 1,
  p_pin_own BOOLEAN  DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  W_FRIEND   CONSTANT FLOAT := 40.0;
  W_RECENCY  CONSTANT FLOAT := 25.0;
  W_ENGAGE   CONSTANT FLOAT := 20.0;
  W_MEDIA    CONSTANT FLOAT := 15.0;
  W_LOCAL    CONSTANT FLOAT := 10.0;

  M_PHOTO    CONSTANT FLOAT := 1.00;
  M_WRAP     CONSTANT FLOAT := 0.90;
  M_POLL     CONSTANT FLOAT := 0.70;
  M_TEXT     CONSTANT FLOAT := 0.45;

  SEEN_LIMIT CONSTANT INT := 3;
  POOL_CAP   CONSTANT INT := 500;
  LOOKAHEAD  CONSTANT INT := 10;

  v_city    TEXT;
  v_session UUID;

  c_ids     UUID[];
  c_authors UUID[];
  c_types   post_type[];
  c_scores  FLOAT[];
  used      BOOLEAN[];
  n         INT;
  head      INT := 1;
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
      AND NOT EXISTS (
        SELECT 1 FROM post_impressions pi
         WHERE pi.user_id = p_user_id
           AND pi.post_id = p.id
           AND pi.views >= SEEN_LIMIT
      )
  )
  SELECT
    pool.id,
    pool.author_id,
    pool.type,
    pool.created_at,
    (p_pin_own AND pool.is_own
       AND pool.created_at > NOW() - INTERVAL '5 minutes') AS is_pinned,
    (
        W_FRIEND  * CASE WHEN pool.is_friend THEN 1.0 ELSE 0.0 END
      + W_RECENCY * exp(GREATEST(
          -floor(EXTRACT(EPOCH FROM (NOW() - pool.created_at)) / 3600.0) / 24.0,
          -700.0))
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
    pool.is_own OR pool.is_friend OR pool.same_city
    OR (
      pool.visibility = 'public'
      AND (
        -- THE ONLY CHANGE FROM 066. Tier 2+ drops the cross-city gates: any
        -- public post, anywhere. The gates exist to keep the MAIN feed local
        -- and trustworthy; at the bottom of the feed the alternative to a
        -- wider pool is a dead end.
        p_tier >= 2
        OR (
          pool.a_kyc = 'approved'
          AND pool.created_at < NOW() - INTERVAL '30 minutes'
          AND pool.engagers_48h >= 3
        )
      )
    );

  SELECT COALESCE(array_agg(s.id    ORDER BY s.created_at DESC), ARRAY[]::UUID[]),
         COALESCE(array_agg(s.score ORDER BY s.created_at DESC), ARRAY[]::FLOAT[])
    INTO pin_ids, pin_scores
    FROM _bfs_scored s WHERE s.is_pinned;

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

  n := COALESCE(array_length(c_ids, 1), 0);
  IF n > 0 THEN
    used := array_fill(FALSE, ARRAY[n]);

    FOR i IN 1..n LOOP
      WHILE head <= n AND used[head] LOOP head := head + 1; END LOOP;

      pick := NULL;

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

-- Retire the v1 feed. Nothing has called it since 066 shipped and the client
-- swapped to community_feed_page.
DROP FUNCTION IF EXISTS community_feed(UUID, FLOAT, TIMESTAMPTZ, UUID, INT);

-- Retire the v1 ranking columns. posts.engagement (064) replaced score;
-- hot_since was written by 061 and never read by anything.
ALTER TABLE posts DROP COLUMN IF EXISTS score;
ALTER TABLE posts DROP COLUMN IF EXISTS hot_since;

-- refresh_post_scores now only maintains engagement.
CREATE OR REPLACE FUNCTION refresh_post_scores()
RETURNS void AS $$
BEGIN
  UPDATE posts p SET
    engagement = LEAST(ln(1 + sub.raw) / ln(26.0), 1.0)
  FROM (
    SELECT
      po.id,
      (
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
             WHERE pc.post_id = po.id AND pc.deleted_at IS NULL
               AND pc.created_at > NOW() - INTERVAL '48 hours'
         ) e)
        + (SELECT COUNT(DISTINCT pc2.author_id) FROM post_comments pc2
             WHERE pc2.post_id = po.id AND pc2.deleted_at IS NULL
               AND pc2.created_at > NOW() - INTERVAL '48 hours')
      )::FLOAT AS raw
    FROM posts po
    WHERE po.hidden = FALSE
      AND po.created_at > NOW() - INTERVAL '30 days'
  ) sub
  WHERE p.id = sub.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT refresh_post_scores();
```

- [ ] **Step 2: Apply and verify tier 2 widens the pool**

Paste the completed file into the SQL editor, then:

```sql
SELECT
  (SELECT array_length(post_ids, 1) FROM feed_sessions
    WHERE id = build_feed_session(
      (SELECT id FROM profiles ORDER BY created_at LIMIT 1), 1::SMALLINT, FALSE)) AS tier1,
  (SELECT array_length(post_ids, 1) FROM feed_sessions
    WHERE id = build_feed_session(
      (SELECT id FROM profiles ORDER BY created_at LIMIT 1), 2::SMALLINT, FALSE)) AS tier2;
```

Expected: `tier2 >= tier1`. If your database has no cross-city public posts, they will be equal — that is not a failure, but seed one from a second account to confirm the widening works before shipping.

- [ ] **Step 3: Re-run check4**

Paste `supabase/check4_feed_ranking.sql` again.
Expected: still 11/11 PASS — including rows 10 and 11, which only become meaningful once tier 2 exists. `build_feed_session` was re-created by this migration, so this also guards against a bad paste.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/067_feed_tiers.sql
git commit -m "feat(community): add tier 2 pool widening, drop the v1 feed

Tier 2 drops the cross-city KYC/age/engager gates so the feed widens rather
than dead-ends. Removes community_feed (062), posts.score and the never-read
posts.hot_since.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Caught-up marker

**Files:**
- Modify: `app/(tabs)/community.tsx` (`ListFooterComponent`)

**Interfaces:**
- Consumes: `feed.hasNextPage` from Task 11.
- Produces: the visible end of the feed.

- [ ] **Step 1: Replace the list footer**

Replace the `ListFooterComponent` prop on the `FlatList`:

```tsx
            ListFooterComponent={
              feed.isFetchingNextPage ? (
                <ActivityIndicator
                  color={COLORS.primary}
                  style={{ marginVertical: SPACING[4] }}
                />
              ) : !feed.hasNextPage && posts.length > 0 ? (
                /* The end of the tail. Every tier is exhausted and no seen post
                   is ever re-served, so this is a real stopping point rather
                   than a spinner that never resolves. */
                <View style={styles.caughtUp}>
                  <Text style={styles.caughtUpTitle}>You&apos;re all caught up</Text>
                  <Text style={styles.caughtUpBody}>
                    Check back later, or find something to do nearby.
                  </Text>
                  <EventsRail />
                </View>
              ) : null
            }
```

- [ ] **Step 2: Add the styles**

In the `StyleSheet.create` block. Every token below is verified to exist — `FONTS` and `TYPE_SIZE` come from `@/constants/typography` (**not** `src/components/ui/`, despite what AGENTS.md's table implies), `COLORS` from `@/constants/colors`:

```ts
  caughtUp: {
    alignItems: 'center',
    paddingTop: SPACING[6],
    paddingBottom: SPACING[4],
    gap: SPACING[2],
  },
  caughtUpTitle: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.accent,
  },
  caughtUpBody: {
    // FONTS has no `regular` — the lightest weight in the ramp is `medium`.
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.inkLabel,
    textAlign: 'center',
    marginBottom: SPACING[2],
  },
```

Add `FONTS`/`TYPE_SIZE` to the screen's imports if they are not already there.

- [ ] **Step 3: Verify**

```bash
npm run typecheck && npm test && npx eslint "app/(tabs)/community.tsx"
```

Expected: typecheck 0, tests green, no new lint errors.

- [ ] **Step 4: Verify on a device**

1. Scroll to the very bottom. The tier advance loads more posts, then the caught-up marker appears with the events rail under it.
2. Confirm the marker does **not** appear on an empty feed — `posts.length > 0` guards that, and the existing `CommunityNudgeCard` owns the empty state.
3. Pull to refresh from the bottom. A fresh tier-1 session loads.

Then run **section E — Phase 4** of `docs/testing/community-feed-ranking-v2.md` (Task 15) on iOS and Android.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/community.tsx"
git commit -m "feat(community): show a caught-up marker at the end of the tail

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Device test sheet

Nothing in this redesign is covered by a component test, and the failure modes are visual or silent — a duplicate card, a run of three photos, a feed that ends early. This is the artifact that catches them, and it needs to exist as a document someone can tick through, not as steps buried in a plan.

**Build it first if you are executing out of order** — Tasks 5, 12 and 14 all reference it.

**Files:**
- Create: `docs/testing/community-feed-ranking-v2.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a checklist referenced by Tasks 5 (section C), 12 (section D) and 14 (section E).

- [ ] **Step 1: Write the sheet**

Create `docs/testing/community-feed-ranking-v2.md`:

````markdown
# Community feed ranking v2 — device test sheet

Run on **iOS and Android**. Android is not optional: `minimumViewTime` behaves
differently there and `react-native`'s `SafeAreaView` is a no-op, so a whole
class of bug is invisible on iOS.

Tick each row on each platform. A row that cannot be run (no second account, no
cross-city posts) is **BLOCKED**, not passed — note it and come back.

**Setup you need before starting:**

| Need | Why |
| --- | --- |
| Two accounts, friends with each other | Sections C, D |
| A third account, not a friend, same city | D5, D6 |
| An account with **no** friends and **no** city set | D10 — the empty-feed guard |
| At least 25 posts in the pool, mixed types | Paging and diversity need volume |
| At least 3 photo posts from one author | D6 |

---

## A · Baseline — before any migration

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| A1 | Open Community, scroll to the end | Note how many posts before it stops | ☐ | ☐ |
| A2 | Note the top 5 post ids | The "before" ranking, for comparison | ☐ | ☐ |

## B · Phase 1 — scoring (migration 064)

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| B1 | Vote on a poll from a second account, wait 10 min | The poll rises in the feed | ☐ | ☐ |
| B2 | Scroll the feed | No visible change otherwise — 064 is a scoring change only | ☐ | ☐ |

## C · Phase 2 — impressions (migration 065)

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| C1 | Scroll slowly through 5 posts, dwelling on each | `post_impressions` gains 5 rows, `views = 1` | ☐ | ☐ |
| C2 | Flick fast past 10 posts without stopping | Those posts are **absent** — `minimumViewTime` filtered them | ☐ | ☐ |
| C3 | Scroll the same 5 posts again immediately | `views` still `1` — the 5-minute guard held | ☐ | ☐ |
| C4 | Switch tabs mid-scroll, come back | The tail flushed on blur; no rows lost | ☐ | ☐ |
| C5 | Kill the app mid-scroll | No crash, no unhandled rejection in the log | ☐ | ☐ |
| C6 | Turn on airplane mode and scroll | Feed still scrolls; no error banner, no red box | ☐ | ☐ |
| C7 | Confirm the feed order is unchanged from A2 | 065 must not affect ranking | ☐ | ☐ |

Query for C1/C3:

```sql
SELECT post_id, views, last_seen_at FROM post_impressions
WHERE user_id = '<your uid>' ORDER BY last_seen_at DESC LIMIT 20;
```

## D · Phase 3 — the snapshot (migration 066)

The main event.

### Pagination integrity

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| D1 | Scroll 5+ pages, watching for repeats | **No card appears twice.** The single most likely regression | ☐ | ☐ |
| D2 | Scroll to the end, note the last post | Reaching the end does not error or hang | ☐ | ☐ |
| D3 | From another account, hide/report a post mid-scroll, then keep paging | The feed **keeps going**. A short page must not end it | ☐ | ☐ |
| D4 | Scroll down 5 pages, switch tabs, come back | Position and order preserved; no reshuffle | ☐ | ☐ |

### Ranking

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| D5 | Compare the top 10 against A2 | Order has genuinely changed — friends and fresh photos higher | ☐ | ☐ |
| D6 | Scan 20 cards for runs | No two consecutive from the same author; no two consecutive photos | ☐ | ☐ |
| D7 | Have a friend post; refresh | It appears high, but a fresh engaged local post can still outrank it | ☐ | ☐ |
| D8 | Scroll past a post 3 times over 15+ minutes, then refresh | It is gone from the feed | ☐ | ☐ |

### The own-post pin

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| D9 | Post something | It appears at **position 1** | ☐ | ☐ |
| D10 | Switch tabs and come back (within 5 min) | Still pinned — a focus refetch does not release it | ☐ | ☐ |
| D11 | **Pull to refresh** (within 5 min) | Pin **released**; the post drops to its organic slot | ☐ | ☐ |
| D12 | Pull to refresh again | Still unpinned. **This is the bug the release exists to prevent** | ☐ | ☐ |
| D13 | Post again | Pinned again — posting re-arms it | ☐ | ☐ |
| D14 | Post, wait 6 minutes, switch tabs and back | Unpinned by time alone, no gesture needed | ☐ | ☐ |
| D15 | Post 2 posts inside 5 min | Both pinned, newest first | ☐ | ☐ |

### Edge cases

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| D16 | Sign in as the no-friends / no-city account | Feed is **not empty** | ☐ | ☐ |
| D17 | Block someone with posts in your feed, then refresh | Their posts are gone | ☐ | ☐ |
| D18 | Scroll to the bottom of tier 1 | Stops after one empty tier advance — correct until Phase 4 | ☐ | ☐ |
| D19 | Watch for a phantom "New posts ↑" pill | It only appears for genuinely new content | ☐ | ☐ |

## E · Phase 4 — the endless tail (migration 067)

| # | Step | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| E1 | Scroll to the bottom of tier 1 | More posts load — cross-city ones you have not seen | ☐ | ☐ |
| E2 | Keep scrolling to the true end | "You're all caught up" + the events rail | ☐ | ☐ |
| E3 | Check the tail for repeats | **No post from earlier in the session reappears** | ☐ | ☐ |
| E4 | Confirm the marker is absent on an empty feed | `CommunityNudgeCard` owns that state, not the marker | ☐ | ☐ |
| E5 | Pull to refresh from the bottom | A fresh tier-1 session, scrolled to the top | ☐ | ☐ |

---

## Sign-off

| | iOS | Android |
| --- | --- | --- |
| Device / OS version | | |
| Build | | |
| Date | | |
| Tester | | |
| Blocked rows | | |
````

- [ ] **Step 2: Commit**

```bash
git add docs/testing/community-feed-ranking-v2.md
git commit -m "docs(community): add the feed ranking v2 device test sheet

Nothing in this redesign has component-test coverage and the failure modes
are visual or silent, so the manual sheet is real coverage rather than a
formality. Android rows are not optional.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Full check**

```bash
npm run typecheck   # must be 0
npm test            # must be green
npm run lint        # must not exceed 95 errors / 16 warnings
```

- [ ] **Re-run the SQL checks**

Paste `supabase/check4_feed_ranking.sql` and `supabase/security_checks.sql` into the SQL editor. Both must be all-PASS.

- [ ] **Confirm the cron jobs**

```sql
SELECT jobname, schedule FROM cron.job ORDER BY jobname;
```

Expected: `prune-feed-data` (`7 * * * *`) and `refresh-post-scores` (`*/10 * * * *`). Risk 2 in the spec is that the prune is written but never scheduled — this is the check for it.

- [ ] **Confirm session growth is bounded**

After a day of use:

```sql
SELECT COUNT(*), MIN(created_at) FROM feed_sessions;
```

Expected: `MIN(created_at)` within the last 6 hours. If it is older, `prune_feed_data` is not running.
