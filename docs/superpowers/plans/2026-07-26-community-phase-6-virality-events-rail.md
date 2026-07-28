# Community Phase 6 — Virality + Events rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the reverse-chronological feed into a **hybrid ranked** feed with a
**cold-start fallback ladder** (friends → your city → cross-city popular),
**KYC-gated cross-city virality** with a **velocity/age floor**, **report-threshold
auto-hide**, and a woven-in **"Happening in {city}" events rail**.

**Architecture:** A materialized, viewer-independent `posts.score` (freshness +
distinct-user engagement velocity) is refreshed by a **pg_cron** job (023/032
pattern) so ordering is frozen within a scroll session (the reshuffle bug `010`
fixed). `community_feed` is rewritten to add **viewer-specific** boosts at query
time — friend affinity + same-city — on top of that frozen base, and keysets on
`(score, created_at, id)`. Cross-city public posts enter the pool **only** when
the author is `kyc_status='approved'` **and** the post clears an age + distinct-
engager floor. A `reports` INSERT trigger auto-hides a post at **≥3 distinct
reporters** (`posts.hidden`), which the feed now filters. The events rail is
**client-only**: an `EventsRail` injected every ~9 posts using the existing
`useNearbyEvents` + event card plumbing; absent when there are no nearby events.

**Tech Stack:** Supabase plpgsql + pg_cron, TanStack Query v5, expo-router.

## Global Constraints
- Never hardcode a colour/font/radius — `COLORS` / `FONTS` / `TYPE_SIZE` / `RADIUS` / `SPACING`.
- **Keyset, never offset** — offset over a moving ranking dupes/gaps (spec §6).
  Cursor is `(score, created_at, id)`.
- **Score is materialized, not per-request** — the RPC reads `posts.score` and only
  adds deterministic viewer boosts, so a session's ordering can't reshuffle.
- Friends-only posts are **physically un-amplifiable** — never in the cross-city
  pool (RLS already keeps them out for non-friends; the ranking never adds them).
- Events rail is **always your city, never cross-city** (spec §8); reuse the
  existing event card + `openEvent`/global sheet, don't build a new card.
- Reuse existing infra: `reports` table (014/054), `is_event_attendee` not needed
  here, `useNearbyEvents`, the `reportComment` service shape, pg_cron idiom.
- **Deferred (not in this phase):** the "new posts ↑" pill (spec §6 prose, not in
  the phase-6 deliverable row) — note it for the final polish pass.

---

### Task 1: Migration 061 — post score refresh (cron) + report auto-hide trigger

**Files:**
- Create: `supabase/migrations/061_post_scoring.sql`

**Interfaces:**
- Produces: `refresh_post_scores()` + cron `refresh-post-scores`; an
  `on_post_report` trigger auto-hiding posts at ≥3 distinct reporters.

Design notes:
- `posts.score` (column exists since 044) becomes the **viewer-independent**
  ranking base: freshness decay + `ln(1+distinct_engagers)` velocity over a 48h
  window. Friend/same-city are **not** here (they're per-viewer, added in the RPC).
- Only rescore recent, non-hidden posts (last 30 days) — old posts sink and stay.
- `hot_since` is set the first time a post has any windowed engagement (a cheap
  "was ever hot" marker; the RPC doesn't require it but §5 reserves it).
- Auto-hide: counts **distinct `reporter_id`** for a `post_id` (a ring double-
  reporting can't trip it); `SECURITY DEFINER` so the trigger can update posts.
- Header must NOT start a line with the `COMMENT` keyword. Run whole file.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- POST SCORING + AUTO-HIDE. posts.score is the viewer-INDEPENDENT ranking base
-- (freshness + distinct-user engagement velocity), refreshed by pg_cron so a
-- scroll session's order is frozen (the reshuffle bug 010 fixed). Friend/same-
-- city boosts are per-viewer and live in community_feed (062), not here. A
-- reports INSERT auto-hides a post at >=3 DISTINCT reporters. Run whole file.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION refresh_post_scores()
RETURNS void AS $$
BEGIN
  UPDATE posts p SET
    score = sub.s,
    hot_since = CASE
      WHEN p.hot_since IS NULL AND sub.engagers > 0 THEN NOW()
      ELSE p.hot_since
    END
  FROM (
    SELECT
      p2.id,
      p2.engagers,
      -- freshness: decays over ~2 days; + velocity: distinct engagers, damped.
      6.0 * exp(GREATEST(-EXTRACT(EPOCH FROM (NOW() - p2.created_at)) / 172800.0, -700.0))
      + 10.0 * ln(1 + p2.engagers) AS s
    FROM (
      SELECT
        po.id,
        po.created_at,
        (
          SELECT COUNT(DISTINCT u) FROM (
            SELECT pl.user_id AS u FROM post_likes pl
              WHERE pl.post_id = po.id AND pl.created_at > NOW() - INTERVAL '48 hours'
            UNION
            SELECT pc.author_id AS u FROM post_comments pc
              WHERE pc.post_id = po.id AND pc.created_at > NOW() - INTERVAL '48 hours'
                AND pc.deleted_at IS NULL
          ) e
        ) AS engagers
      FROM posts po
      WHERE po.hidden = FALSE AND po.created_at > NOW() - INTERVAL '30 days'
    ) p2
  ) sub
  WHERE p.id = sub.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-post-scores');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'refresh-post-scores',
  '*/10 * * * *',
  $$SELECT refresh_post_scores()$$
);

-- Auto-hide a post once >=3 DISTINCT users report it (pending human review).
CREATE OR REPLACE FUNCTION on_post_report()
RETURNS TRIGGER AS $$
DECLARE
  v_distinct INT;
BEGIN
  IF NEW.post_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(DISTINCT reporter_id) INTO v_distinct
  FROM reports WHERE post_id = NEW.post_id;
  IF v_distinct >= 3 THEN
    UPDATE posts SET hidden = TRUE, hidden_reason = 'auto_reports'
    WHERE id = NEW.post_id AND hidden = FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_report ON reports;
CREATE TRIGGER on_post_report
  AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION on_post_report();
```

- [ ] **Step 2: Commit** (`feat(community): post score refresh cron + report auto-hide (061)`)

---

### Task 2: Migration 062 — community_feed v5 (ranked ladder + gates + hidden filter)

**Files:**
- Create: `supabase/migrations/062_community_feed_ranked.sql`

**Interfaces:**
- Produces: `community_feed(p_user_id, p_cursor_score, p_cursor_created_at,
  p_cursor_id, p_limit)` — **new signature** (adds `p_cursor_score FLOAT`), returns
  the v4 columns **plus** `score FLOAT`. Ordered by `(score DESC, created_at DESC,
  id DESC)`; keyset on that triple.

Design notes:
- `SECURITY INVOKER` stays → posts RLS still gates base visibility (own + public +
  friends-of-author + block checks). This RPC then **ranks** and **filters the
  cross-city pool**.
- Viewer city = `(SELECT city FROM profiles WHERE id = p_user_id)`.
- `final_score = p.score + (friend ? 100 : 0) + (same_city ? 50 : 0)` — the tiers
  of the fallback ladder fall out of the boosts (friend > same-city > cross-city),
  so a single ORDER BY expresses the ladder and cross-city is always the backstop.
- **Cross-city gate:** a public post that is neither the viewer's, a friend's, nor
  same-city is included **only if** author `kyc_status='approved'` AND age ≥ 30 min
  AND distinct engagers ≥ 3. Otherwise excluded (WHERE clause).
- **hidden filter:** `WHERE p.hidden = FALSE` (v4 didn't filter it — latent bug).
- Keyset triple; `p_cursor_score` NULL ⇒ first page.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- COMMUNITY FEED v5: hybrid ranked + fallback ladder + cross-city KYC/velocity
-- gate + hidden filter. posts.score (materialized, 061) is the frozen base;
-- friend/same-city boosts are added here per viewer so the order is stable in a
-- session. Cross-city public posts join the pool only if the author is KYC'd and
-- the post clears an age + distinct-engager floor. Keyset on (score, created_at,
-- id) — never offset. New signature (adds p_cursor_score). Run whole file.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS community_feed(UUID, TIMESTAMPTZ, UUID, INT);
DROP FUNCTION IF EXISTS community_feed(UUID, FLOAT, TIMESTAMPTZ, UUID, INT);
CREATE OR REPLACE FUNCTION community_feed(
  p_user_id           UUID,
  p_cursor_score      FLOAT       DEFAULT NULL,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id         UUID        DEFAULT NULL,
  p_limit             INT         DEFAULT 10
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
  score             FLOAT
)
LANGUAGE sql STABLE
AS $$
  WITH viewer AS (
    SELECT city AS vcity FROM profiles WHERE id = p_user_id
  ),
  ranked AS (
    SELECT
      p.*,
      pr.name       AS a_name,
      pr.photo_url  AS a_photo,
      (p.author_id = p_user_id) AS is_own,
      EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = 'accepted'
          AND ((f.requester_id = p_user_id AND f.addressee_id = p.author_id)
            OR (f.addressee_id = p_user_id AND f.requester_id = p.author_id))
      ) AS is_friend,
      (p.city IS NOT DISTINCT FROM (SELECT vcity FROM viewer)) AS same_city,
      pr.kyc_status AS a_kyc,
      (
        SELECT COUNT(DISTINCT u) FROM (
          SELECT pl.user_id AS u FROM post_likes pl WHERE pl.post_id = p.id
          UNION
          SELECT pc.author_id AS u FROM post_comments pc
            WHERE pc.post_id = p.id AND pc.deleted_at IS NULL
        ) e
      ) AS engagers
    FROM posts p
    JOIN profiles pr ON pr.id = p.author_id
    WHERE p.hidden = FALSE
  )
  SELECT
    r.id, r.author_id, r.a_name, r.a_photo, r.type, r.visibility,
    r.body, r.media, r.city, r.like_count, r.comment_count, r.created_at,
    EXISTS (SELECT 1 FROM post_likes pl
            WHERE pl.post_id = r.id AND pl.user_id = p_user_id) AS liked_by_me,
    r.comments_enabled,
    r.ref_wrap_event_id,
    (r.score
      + CASE WHEN r.is_friend THEN 100.0 ELSE 0 END
      + CASE WHEN r.same_city THEN 50.0 ELSE 0 END)::FLOAT AS score
  FROM ranked r
  WHERE
    -- Local pool: yours, friends', or same-city — always allowed.
    (r.is_own OR r.is_friend OR r.same_city)
    -- Cross-city pool: public + KYC'd author + age & distinct-engager floor.
    OR (
      r.visibility = 'public'
      AND r.a_kyc = 'approved'
      AND r.created_at < NOW() - INTERVAL '30 minutes'
      AND r.engagers >= 3
    )
  -- Keyset over the FINAL score (base + viewer boosts), then recency, then id.
  -- p_cursor_score NULL ⇒ first page. The compared score must equal the SELECT's.
  AND (
    p_cursor_score IS NULL
    OR (
      (r.score
        + CASE WHEN r.is_friend THEN 100.0 ELSE 0 END
        + CASE WHEN r.same_city THEN 50.0 ELSE 0 END),
      r.created_at, r.id
    ) < (p_cursor_score, p_cursor_created_at, p_cursor_id)
  )
  ORDER BY score DESC, r.created_at DESC, r.id DESC
  LIMIT p_limit;
$$;
```

  Note on the keyset tuple comparison: Postgres compares row tuples
  lexicographically, so `(scoreExpr, created_at, id) < (cursor…)` gives strictly
  "ranked after the cursor" for a DESC ordering. The `scoreExpr` is repeated
  verbatim (not the output alias) because a WHERE cannot see the SELECT alias.

- [ ] **Step 2: Commit** (`feat(community): community_feed v5 ranked + gates (062)`)

---

### Task 3: Client — score in the keyset cursor

**Files:**
- Modify: `src/types/models.ts` (`CommunityPost.score`)
- Modify: `src/services/community/posts.service.ts` (`FeedCursor` + `getCommunityFeed`)
- Modify: `src/hooks/useCommunityFeed.ts` (`nextCommunityCursor`)
- Modify: `src/hooks/__tests__/useCommunityFeed.test.ts` (cursor now carries score)

**Interfaces:**
- Produces: `FeedCursor = { score: number; createdAt: string; id: string }`;
  `CommunityPost.score: number`.

- [ ] **Step 1: Types.** Add `score: number;` to `CommunityPost` (after
  `created_at`). It's feed-ranking metadata the cursor reads; cards ignore it.

- [ ] **Step 2: Service.** In `posts.service.ts`:
  - `export type FeedCursor = { score: number; createdAt: string; id: string };`
  - `getCommunityFeed` passes `p_cursor_score: params.cursor?.score ?? null` (add
    it to the `.rpc('community_feed', {...})` args).

- [ ] **Step 3: Cursor.** In `useCommunityFeed.ts` `nextCommunityCursor`, return
  `{ score: last.score, createdAt: last.created_at, id: last.id }`.

- [ ] **Step 4: Test.** In `useCommunityFeed.test.ts`, the `post()` fixture gains
  `score: 0`; any cursor assertion that checked `{ createdAt, id }` now expects
  `{ score, createdAt, id }`. Update expectations. Run `npx jest useCommunityFeed`.

- [ ] **Step 5:** `npm run typecheck` → 0; jest green. Commit
  (`feat(community): score in feed keyset cursor`).

---

### Task 4: Post reporting — service + overflow menu (report others / delete own)

**Files:**
- Modify: `src/services/moderation.service.ts` (`reportPost`)
- Modify: `src/components/community/PostCard.tsx` (overflow always available)
- Modify: `app/(tabs)/community.tsx` (overflow → report sheet for others, delete for own)

**Interfaces:**
- Produces: `reportPost({ reporterId, reportedId, postId, reason, details? })`.

- [ ] **Step 1: Service.** Add to `moderation.service.ts`, mirroring `reportComment`:

```ts
// Report a specific post. reported_id carries the author; post_id points at the
// offending row (migration 054). >=3 distinct reporters auto-hides it (061).
export async function reportPost(params: {
  reporterId: string;
  reportedId: string;
  postId: string;
  reason: ReportReason;
  details?: string;
}): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: params.reporterId,
    reported_id: params.reportedId,
    post_id: params.postId,
    reason: params.reason,
    details: params.details ?? null,
  });
  if (error) throw error;
}
```

- [ ] **Step 2: PostCard.** The overflow glyph currently shows only for own posts
  (`onOverflow={isOwn ? ... : undefined}` at the call site). Make `PostAuthorRow`
  render the overflow for **all** posts and let the screen branch. In
  `app/(tabs)/community.tsx`, change the `PostCard` call to always pass
  `onOverflow={onOverflow}` (remove the `isOwn ?` guard there) — the menu content
  is decided by `isOwn` in the handler.

  Confirm `PostAuthorRow` shows the overflow whenever `onOverflow` is defined;
  since we now always pass it, nothing else changes there.

- [ ] **Step 3: Screen handler.** In `community.tsx`, replace the single
  delete-confirm flow with an overflow that branches on ownership. Simplest that
  fits the existing `Dialog`: keep `pendingDelete` for own posts; add a
  `reportTarget` state + a report `Dialog`/`Sheet` for others. In `onOverflow(post)`:

```ts
function onOverflow(post: CommunityPost) {
  if (post.author_id === meId) setPendingDelete(post);
  else setReportTarget(post);
}
```

  Render a report confirm (reuse the `Dialog` shape; a single "Report post"
  action is fine for MVP — reason defaults to `'inappropriate'`), calling
  `reportPost({ reporterId: meId, reportedId: post.author_id, postId: post.id,
  reason: 'inappropriate' })` then a success toast/haptic. Keep it minimal; the
  full reason picker can come in polish.

- [ ] **Step 4:** `npm run typecheck` → 0; `npm run lint` touched → no new; jest
  green. Commit (`feat(community): report a post (auto-hide at 3) + overflow menu`).

---

### Task 5: EventsRail woven into the feed

**Files:**
- Create: `src/components/community/EventsRail.tsx`
- Modify: `app/(tabs)/community.tsx`

**Interfaces:**
- Consumes: `useNearbyEvents`, the existing event card (`EventRow` or the map/list
  card) + `useUIStore.getState().setSelectedEvent` (the global event sheet).
- Produces: `<EventsRail />` — a "Happening in {city}" horizontal strip; renders
  **nothing** when there are no nearby events.

- [ ] **Step 1: Build EventsRail.**
  - `const nearby = useNearbyEvents();` take the first ~8 events.
  - If `events.length === 0` → `return null;` (no empty shelf, spec §8).
  - Header row: "Happening in {city}" (city from `useAuthStore((s)=>s.user?.city)`;
    fall back to "nearby") + optional "See all" → `router.push('/(tabs)/map')` or
    the explore surface.
  - A horizontal `ScrollView` (not FlatList — it lives inside the feed FlatList;
    nested VirtualizedLists warn) of compact event cards. Reuse `EventRow` in a
    fixed-width wrapper, or the existing compact card; tap →
    `useUIStore.getState().setSelectedEvent(e.id)` (the same global sheet the
    profile uses). No new card component if `EventRow` fits a horizontal wrapper;
    otherwise a small local card, commented why.
  - `panel`-tier framing is optional; the rail is "punctuation" (spec §12).

- [ ] **Step 2: Inject every ~9 posts.** In `community.tsx`, the `FlatList` renders
  `posts`. Insert the rail without breaking keyset paging by rendering it from
  `renderItem` after every 9th post:

```tsx
renderItem={({ item, index }) => (
  <>
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 60).duration(350)}>
      <PostCard ... />
    </Animated.View>
    {(index + 1) % 9 === 0 ? <EventsRail /> : null}
  </>
)}
```

  (The rail is city-only and self-hiding, so injecting on a cadence is safe even
  when surrounding posts are cross-city — it never pulls other cities' events.)

- [ ] **Step 3:** `npm run typecheck` → 0; `npm run lint` touched → no new. Commit
  (`feat(community): Happening-in-city events rail woven into feed`).

---

### Verification
- `npm run typecheck` → 0; `npx jest --forceExit` → green; `npm run lint` on
  touched files → no new.
- Apply migrations **061** and **062** in the Supabase SQL editor (whole files);
  confirm both cron jobs exist
  (`SELECT jobname FROM cron.job WHERE jobname IN ('refresh-post-scores','close-expired-polls');`).
- **Ranking is not fully verifiable without real content** (spec: "needs real
  content to tune") — state that in the summary. What *can* be checked:
- Append a **Phase 6** section to `docs/superpowers/tests/community-manual-qa.md`:
  - **DB:** after `SELECT refresh_post_scores();`, `posts.score` is populated;
    3 distinct reporters on a post flips `hidden = TRUE` and it drops from
    `community_feed`; a cross-city public post from a **non-KYC** author never
    appears; a same-city / friend post always ranks above an equal cross-city one;
    a friends-only post never appears cross-city.
  - **Device:** feed still paginates without dupes/gaps (keyset); the events rail
    shows "Happening in {city}" every ~9 posts and taps through to the event
    sheet; no rail when there are no nearby events; reporting someone's post 3×
    (distinct accounts) hides it; overflow shows Report on others' posts and
    Delete on your own; Android flat-glass rail legible.
- Update memory `community-feed-project.md` (Phase 6 done, migrations 061 + 062 +
  `refresh-post-scores` cron; "new posts ↑" pill deferred to polish; Phase 7 next).
