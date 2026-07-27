# Community feed ranking v2 — design

**Status:** approved for phased implementation · **Date:** 2026-07-27
**Supersedes:** §6 ("Feed & ranking") of `2026-07-25-community-feed-design.md`
**Touches:** migrations 061 / 062, `useCommunityFeed`, `posts.service`, `app/(tabs)/community.tsx`

---

## 1. One line

Replace the current two-tier "friends, then city, then everyone — popular first"
feed with a **per-session ranked snapshot**: a normalised weighted score, a
diversity re-rank, seen-post filtering, and an endless tail that widens the pool
instead of repeating itself.

---

## 2. What is wrong today (measured, not assumed)

The feed is built from `posts.score` (materialised by `refresh_post_scores`,
migration 061) plus per-viewer boosts added in `community_feed` (062):

```
posts.score = 6·exp(−age/2d) + 10·ln(1 + engagers_48h)
final       = posts.score + 100·is_friend + 50·same_city
```

**a. The boosts are hard tiers, not signals.** Base score realistically tops out
near 40. A same-city post needs **82+ distinct engagers in 48h** to outrank a
friend's blank post. In practice the feed is strictly: every friend post, then
every same-city post, then everyone else.

**b. Inside a tier, only popularity moves.** Freshness is capped at 6 points
forever, while `10·ln(1+n)` passes 6 at **two engagers**. A two-day-old post with
five likes buries a post from ten minutes ago. This is the reported symptom.

**c. Polls are invisible to scoring.** `refresh_post_scores` counts `post_likes`
and `post_comments` only. A poll with 40 votes and no likes scores as dead.

**d. Your own new post is not surfaced.** `posts.score DEFAULT 0` and the cron
runs every 10 minutes, so a fresh post carries a stale score; `is_own` grants
pool access with no boost. You post and cannot find it.

**e. `city` matching is wrong.** `p.city IS NOT DISTINCT FROM vcity` (062:53)
makes `NULL = NULL` true, so every user who never set a city is "same city" as
every city-less post. `'New York'` and `'New York City'` are different cities.

**f. Two definitions of one word.** The cross-city gate counts **lifetime**
engagers (062:87); the score counts **48h** engagers (061:31).

**g. `hot_since` is written and never read.** Dead column.

**h. No diversity, no seen-state, no tail.** One chatty friend can own the whole
first page; every open shows the same top posts; `getNextPageParam` returns
`undefined` on a short page and the feed dead-ends.

---

## 3. Decisions log

Settled during brainstorming; each was stress-tested before writing.

1. **Every signal is normalised to 0–1, then weighted.** This is what makes
   "friendship is the biggest factor but does not trump everything" a tunable
   number rather than an emergent accident.
2. **Friendship weight 40 of ~110.** Heaviest single lever; three other signals
   together can outvote it. Explicitly *not* a tier.
3. **Media ladder `photo > shared_wrap > poll > text`**, with the floor raised so
   the photo→text gap is ~8 points ≈ **10 hours of freshness**, not 16.
4. **Diversity is a re-rank pass after scoring, never a score term.** Confirmed
   by Meta ("do not show items from the same authors in a sequence") and X
   ("Author Diversity: avoid too many consecutive Tweets from a single author").
   Applied to **both** author and post type.
5. **Seen posts are hard-filtered, not decayed.** X removes "posts you have
   already seen" in candidate sourcing. Threshold: 3 views.
6. **Pagination is a session snapshot, not a keyset over a live score.** Keyset
   over a volatile ranking is a known-broken pattern — it is the open Bluesky
   Discover-feed duplicate bug. See §4.
7. **The endless tail widens the pool; it never recycles seen posts.** Instagram
   ships "You're All Caught Up" then *Suggested Posts* from accounts you don't
   follow — a different pool, not a repeat.
8. **Own posts pin for 5 minutes or until a manual refresh**, whichever comes
   first.

Sources consulted are listed in §12.

---

## 4. Architecture: the session snapshot

**The problem with what exists.** `community_feed` paginates by keyset over
`(score, created_at, id)`. `score` changes every 10 minutes (cron) and would
change continuously once recency carries real weight. When the ranking shifts
between page fetches, rows cross the page boundary and are **duplicated or
skipped** — silently, with no error, no type failure and no lint warning.
Adding the planned `pass` and `is_pinned` fields would have made it a five-field
cursor across three passes, i.e. more of the same failure mode.

**The fix.** Rank once per session into a frozen array of post ids; paginate by
slicing it.

```
build_feed_session(user, tier, pin_own)  →  feed_sessions row  →  UUID[] + FLOAT[]
community_feed_page(session, offset, limit)  →  hydrated slice
```

This is the pattern practitioners describe as a "Feed entity": the client gets a
feed id on first request, later pages reference it, old sessions expire on a TTL.

**What it buys, beyond correctness:**

| Concern | Keyset | Snapshot |
| --- | --- | --- |
| Duplicates / skips | Silent, likely | Structurally impossible |
| Diversity re-rank | Window-function approximation, breaks at page seams | Exact — the whole list is in hand |
| Pagination state | 5-field tuple across 4 files | `(session_id, offset)` |
| Pull-to-refresh | Extra flag in the query key | Build a new session |
| Mid-scroll vanishing | Needed a 30-min grace window | Frozen array; grace window deleted |
| Cost | Cheap query, fragile | Full pool scan per session |

The last row is the only real trade. At Mello's post volume a scan of the pool
is nothing, and the snapshot is capped at 500 ids. If the feed ever reaches a
scale where this hurts, that is a good problem and the fix is caching the build.

### 4.1 `feed_sessions`

```sql
CREATE TABLE feed_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tier        SMALLINT NOT NULL DEFAULT 1,
  post_ids    UUID[]  NOT NULL,
  post_scores FLOAT[] NOT NULL,   -- parallel to post_ids; keeps the snapshot debuggable
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX feed_sessions_user_idx ON feed_sessions (user_id, created_at DESC);
```

RLS: own rows only, select + insert. The existing 10-minute cron prunes rows
older than one hour.

`post_scores` is stored purely so the `score` field of `CommunityPost` keeps its
real value — the type stays byte-identical, and "why is this post fourth?" is
answerable from the row.

---

## 5. The scoring model

Each signal is a 0–1 sub-score, then weighted. Computed at build time.

| Signal | Sub-score | Weight |
| --- | --- | ---: |
| Friendship | 1 if accepted friend, else 0 | **40** |
| Recency | `exp(−age_hours / 24)` | **25** |
| Engagement | `ln(1+e) / ln(26)`, clamped to 1 | **20** |
| Media type | see below | **15** |
| Locality | 1 if same city (or own post) | **10** |

`e` = distinct users who liked, commented, **or voted in a poll** on the post in
the last 48h, with commenters counted twice — conversation is a stronger signal
than a tap. Poll votes count for the first time (fixes §2c).

**Media ladder** (post types are `photo | shared_wrap | poll | text`):

| Type | Sub-score | Points | vs. text |
| --- | ---: | ---: | ---: |
| `photo` | 1.00 | 15.00 | +8.25 |
| `shared_wrap` | 0.90 | 13.50 | +6.75 |
| `poll` | 0.70 | 10.50 | +3.75 |
| `text` | 0.45 | 6.75 | — |

The gap is calibrated in units everyone has intuition for: **a photo is worth
being about 10 hours fresher than a text post.** At the originally-proposed
`text = 0.2` it was 16 hours, which buries good text permanently.

**Sanity check:**

| Post | Sum | Score |
| --- | --- | ---: |
| Friend, fresh, photo | 40 + 25 + 0 + 15 + 10 | **90** |
| Stranger, same city, fresh photo, 10 engagers | 0 + 25 + 15 + 15 + 10 | **65** |
| Friend, 2 days old, dead, text | 40 + 3 + 0 + 6.75 + 10 | **59.75** |
| Stranger, cross-city, fresh photo, dead | 0 + 25 + 0 + 15 + 0 | **40** |

Friends dominate the head of the feed when they are active; a good local post
beats a friend's stale one. That is the requirement.

**The seven weights live in one commented constant block** at the top of the
migration, so retuning is editing numbers rather than unpicking an expression.

---

## 6. The diversity re-rank

Runs over the full ordered list, after scoring, before storage. Greedy, exact,
and bounded:

```
remaining := posts ordered by score DESC, created_at DESC, id DESC
result := []
last_author, last_type := NULL

while remaining is not empty:
  pick the first item within the next K=10 whose author ≠ last_author
                                          and type   ≠ last_type
  else the first within K whose author ≠ last_author
  else the head of remaining
  append it; remove it; update last_author / last_type
```

**Why greedy-with-lookahead rather than strict interleave.** The `K = 10` bound
means a post can be displaced at most ten slots, so score still dominates
ordering — a genuinely great photo is not held back indefinitely because the
previous row was a photo. It also degrades gracefully: a day when the only
content is photos still yields a full feed, just reordered.

Author separation is checked before type separation because it is the one Meta
and X both enforce, and because "three posts in a row from one friend" is more
jarring than "two photos in a row".

Cost is O(n·K) over at most 500 rows — microseconds.

---

## 7. Candidate pool and the endless tail

The tail is **tiers**, not passes. Each tier is a fresh session build over a
wider pool. Seen posts are never re-served.

| Tier | Pool |
| --- | --- |
| **1** | Own + friends' + same-city posts, **plus** gated cross-city posts (public + KYC-approved author + ≥30 min old + ≥3 engagers) — i.e. today's pool, minus seen |
| **2** | Tier 1 **with the cross-city gates dropped** — any public post, anywhere |
| **3** | Nothing new to rank — the client shows the events rail and a caught-up marker |

Tier 1 keeps the gated cross-city rung deliberately: cross-city virality is a
designed feature of the original Community spec (§7 there), not an overflow
behaviour. Tier 2 widens it rather than introducing it.

Within every tier:

- **Visibility, blocks and friends-only scoping stay in RLS** on `posts`
  (migration 044). Both functions are SECURITY INVOKER. Nothing is
  re-implemented in the feed layer.
- **Seen filter:** exclude posts with `post_impressions.views >= 3`.
  No grace window is needed — the snapshot is frozen, so nothing can vanish
  mid-scroll. (This deletes a piece of complexity the keyset design required.)
- **City fix:** `p.city = vcity AND vcity IS NOT NULL`, and own posts always
  count as local. Fixes §2e.
- **Cross-city engager gate** switches to the same 48h window the score uses.
  Fixes §2f.
- **`hot_since`** is dropped. Fixes §2g.

**Tier 2 deliberately contradicts tier 1's cross-city gates, and tier 3
deliberately ends the feed.** Both need a comment in the SQL so nobody later
"fixes" the inconsistency.

---

## 8. Seen state

### 8.1 `post_impressions`

```sql
CREATE TABLE post_impressions (
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id      UUID NOT NULL REFERENCES posts(id)    ON DELETE CASCADE,
  views        INT  NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);
```

The primary key doubles as the lookup index for the build join. RLS: own rows
only. The existing cron prunes rows older than 30 days.

### 8.2 `record_impressions(p_post_ids UUID[])`

One RPC per flush, batching the whole buffer into a single round trip.

```sql
ON CONFLICT (user_id, post_id) DO UPDATE
  SET views = post_impressions.views + 1, last_seen_at = NOW()
  WHERE post_impressions.last_seen_at < NOW() - INTERVAL '5 minutes'
```

**The `WHERE` guard is load-bearing.** Without it, scrolling up and down over
one post inflates it to "seen three times" in seconds and filters out content
the user barely glanced at.

### 8.3 Client tracking

`onViewableItemsChanged` on the existing `FlatList`, config
`{ itemVisiblePercentThreshold: 60, minimumViewTime: 1000 }` — 60% of the card
on screen for a full second. Ids buffer in a ref; flush every 5s, on blur, and
on unmount.

Two constraints that will bite if missed:

- **Both the handler and the config must be `useRef`-stable.** React Native
  throws `Changing onViewableItemsChanged on the fly is not supported`, and this
  screen re-renders constantly.
- **The flush must never invalidate `queryKeys.community.feed`.** It is
  fire-and-forget. Invalidating would rebuild the session and reorder the feed
  under the user's thumb — the class of failure `community.tsx:84-95` already
  documents having fought once.

---

## 9. The own-post pin

```
is_pinned = p_pin_own AND author_id = viewer AND created_at > NOW() - INTERVAL '5 minutes'
```

Pinned posts are moved to the head of the array after the diversity re-rank, so
the pin cannot be displaced by it. Two independent release conditions:

- **Time** — the 5-minute window expires, and the next session build ranks the
  post organically.
- **Gesture** — pull-to-refresh builds a new session with `p_pin_own = false`,
  and that sticks for the session.

Post three times in five minutes and all three pin, newest first. That is
correct, not a case to special-case.

`community.tsx:106` sets `knownTopId` before refetching and pull-to-refresh
implies `scrollY = 0`, so the top-id change from the pin dropping is adopted
silently rather than firing a phantom "New posts ↑" pill. Verified against the
existing logic; no change needed there beyond §10.

---

## 10. The read path and the client

### 10.1 `community_feed_page`

```sql
community_feed_page(
  p_user_id    UUID,
  p_session_id UUID     DEFAULT NULL,   -- NULL ⇒ build a session first
  p_tier       SMALLINT DEFAULT 1,
  p_pin_own    BOOLEAN  DEFAULT TRUE,
  p_offset     INT      DEFAULT 0,
  p_limit      INT      DEFAULT 10
)
```

Returns the existing `CommunityPost` columns **plus** `session_id UUID` and
`session_total INT` on every row, so a cold start is **one round trip**, not two.
Rows are hydrated from `post_ids` via `WITH ORDINALITY` and ordered by array
position.

**A short page does not mean the end of the feed.** The function is SECURITY
INVOKER, so a post hidden, deleted or blocked since the snapshot was taken drops
out of its slice. Paging must therefore be driven by `offset` against
`session_total`, never by page length — the opposite of the current
`lastPage.length < PAGE_SIZE` heuristic in `useCommunityFeed.ts:32`, which would
silently truncate the feed here.

### 10.2 Client changes

| File | Change |
| --- | --- |
| `posts.service.ts` | `FeedCursor` → `FeedPageParam = { sessionId, tier, offset, pinOwn }`; `getCommunityFeed` passes the new params |
| `useCommunityFeed.ts` | `nextCommunityCursor` → `nextFeedPage`, driven by `offset + limit < session_total`, advancing tier on exhaustion and returning `undefined` after tier 3 |
| `community.tsx` | dedupe by id in the existing `useMemo` (65-68); `onViewableItemsChanged`; pull-to-refresh resets to `{ sessionId: null, tier: 1, pinOwn: false }` |
| `useImpressionTracker.ts` | **new** — buffer/flush factory |
| `useCommunityFeed.test.ts` | rewritten for `nextFeedPage` |

Phase 4 adds one more: `community.tsx` renders the caught-up marker and a final
events rail when `nextFeedPage` reports tier 3 exhausted, in place of today's
silent dead-end.

`user_posts` (057) is untouched — it keeps its own keyset and its own `score`
column. `get_post` (063) is **not** untouched: 069 drops `posts.score` (see
§11) and had to re-create `get_post` verbatim with `p.score` replaced by
`0::FLOAT`, since it selected that column and declared it in `RETURNS TABLE`.
`CommunityPost` does not change shape either way — `score` stays in the type
and in `get_post`'s return row; nothing on that deep-link path reads its
value.

`queryKeys.community.feed` already sits in `DISCOVERY_FEED_KEYS`, so blocking
still scrubs the feed. No change there.

**Dedupe by id in the client `useMemo`.** Tier advance can legitimately re-serve
a post that entered the pool between builds. One line, robust against every
cross-tier case, and it cannot drift out of sync with the ranking.

---

## 11. Phasing

Four phases, each independently valuable and revertable. The order is chosen so
that **the impression collector ships before its consumer** — seen-filtering has
real data the day it turns on, instead of filtering nothing for a week.

| Phase | Migration | Contents | Observable effect |
| --- | --- | --- | --- |
| **1** | 064 | `refresh_post_scores` v2 — poll votes counted, commenters weighted 2×, **written to a new `posts.engagement` column** as well as the existing `score` | Polls stop scoring as dead |
| **2** | 065 | `post_impressions` + RLS + `record_impressions` + cron prune, **plus** client tracking | None — data accumulates silently |
| **3** | 066 | `feed_sessions`, `build_feed_session`, `community_feed_page`, tier 1 only, weights, diversity, pin, seen filter, city/gate/`hot_since` fixes; client pagination swap | **The ranking change.** Stop here and check on a device |
| **4** | 069 | Tier 2 (gate-dropping) + caught-up marker (client state) + v1 ranking retirement | The endless tail |

Migration numbers past phase 3 shifted from this table's original plan: 067
shipped first as an unplanned production-regression patch (profiles.city was
never written, so the same-city pool rung silently admitted no one — see
067's own header), and 068 shipped as reported-post hiding — neither planned
here. Phase 4 landed in 069, not 067.

`community_feed` (062) stays in place through phase 3 for rollback, and is
dropped in phase 4.

**Phase 1 adds a column rather than repurposing `score`.** The new engagement
sub-score is on a 0–1 scale; the live `community_feed` (062) adds `+100`/`+50`
to `posts.score` and would collapse into pure tier ordering if that column
suddenly ranged 0–1. So `refresh_post_scores` v2 writes **both** — the old
composite into `score` (keeping 062 working, now with polls counted) and the new
normalised value into `engagement`, which phase 3 reads. `score` and `hot_since`
are dropped in phase 4.

Phase 3 is the large one and the only one that touches ranking and pagination
together — they cannot be separated, because the snapshot *is* the pagination.

---

## 12. Testing

Per AGENTS.md there is no component-test coverage (Reanimated 4 throws under
Jest), so `tsc` passing says nothing about whether this is right. Coverage is:

- **SQL verification scripts are the real coverage.** There is no local Supabase,
  no CLI and no SQL test runner in this repo — migrations are pasted into the
  Supabase SQL editor by hand. So these follow the existing house pattern of
  `supabase/check3_attendee_preview_behaviour.sql`: a `pg_temp.checkN()`
  function that seeds fixtures, asserts, and ends in `RAISE EXCEPTION` so every
  write rolls back while the collected results survive in local variables. Safe
  to run against production, returns a `verdict` column that must read PASS.

  Seed a matrix — friend/stranger × each post type × fresh/stale × engaged/dead
  × seen/unseen — and assert the resulting **order**, not the scores. Order is
  the contract; weights will be retuned.
- **Diversity assertions:** no two consecutive posts share an author; no two
  consecutive share a type where the pool allows it; a photo-only pool still
  returns every post.
- **`nextFeedPage` unit tests** replacing the `nextCommunityCursor` suite: page
  advance, short page mid-session (must **not** end the feed), tier advance on
  exhaustion, `undefined` after tier 3.
- **Impression buffer unit tests** — the batching lives in a plain factory
  driven without a renderer, the same shape as `participationMutations` in
  `useEventParticipation.ts`.
- **Manual device checklist:** post → pin appears; pull-to-refresh → pin drops;
  scroll for author and photo runs; no phantom "New posts ↑"; scroll to the
  bottom and confirm the tier advance; a throwaway account with no friends and
  no city must not see an empty feed.

**Android specifically** for the viewability work — `minimumViewTime` behaves
differently there, and `SafeAreaView` bugs of this class are invisible on iOS.

---

## 13. Risks and what breaks silently

1. **Short pages ending the feed early.** The single most likely regression, and
   it produces no error. Covered by §10.1 and a dedicated test.
2. **Session table growth.** Bounded by the cron prune; unbounded if the prune
   is not actually scheduled. Verify `cron.job` after deploying 066.
3. **Seen-filter starvation.** A heavy scroller on a thin feed exhausts tier 1
   fast. Mitigated by tier 2 and by the 3-view threshold; watch it on a real
   account before tuning the threshold down.
4. **Snapshot staleness.** A post made while you scroll does not appear until
   the next build. This is intentional and is what the "New posts ↑" pill and
   pull-to-refresh are for.
5. **`build_feed_session` writes on a read path.** It INSERTs during what the
   client thinks is a query. Acceptable, but it means the feed query is not
   idempotent — React Query retries create extra sessions. Bounded by the prune,
   worth a comment.
6. **Weight drift.** Seven numbers with no test asserting absolute values, by
   design. The order assertions are the guard rail; if someone retunes and the
   order tests fail, that is the system working.

---

## 14. Sources

- [Meta — Scaling the Instagram Explore recommendations system](https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/) — four-stage funnel; final re-ranking enforces "do not show items from the same authors in a sequence"
- [X — Twitter's Recommendation Algorithm](https://blog.x.com/engineering/en_us/topics/open-source/2023/twitter-recommendation-algorithm) and [twitter/the-algorithm](https://github.com/twitter/the-algorithm/blob/main/home-mixer/README.md) — Author Diversity, Content Balance, Feedback-based Fatigue; already-seen posts removed in candidate sourcing
- [bluesky-social/atproto #3039](https://github.com/bluesky-social/atproto/issues/3039) — duplicate posts from cursor pagination over a re-ranking feed
- [API Pagination Stability](https://www.getknit.dev/blog/how-to-preserve-api-pagination-stability) — snapshot pinning for unstable sort orders
- [Paginating a ranked feed — practitioner thread](https://www.teamblind.com/post/how-do-you-paginate-a-ranked-feed-g2usbg64) — the "Feed entity + seen log + TTL" pattern
- [Instagram Suggested Posts](https://petapixel.com/2020/08/20/instagrams-suggested-posts-bring-an-endless-scroll-of-new-photos/) — the endless tail widens the pool rather than recycling
