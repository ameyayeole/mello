# Community — design

**Status:** approved for phased implementation · **Date:** 2026-07-25
**Replaces:** the current **Explore** tab (event discovery), which is retired
here and re-homed as an in-feed rail (§8).

---

## 1. One line

Turn the Explore tab into **Community**: an endless, Instagram-style vertical
feed of photos, text posts, polls and shared event wraps — city-wide + friends,
with popular posts able to travel beyond your city — carrying like / comment /
share, built on the app's existing glass, motion, moderation and notification
rails.

---

## 2. What we are building, and what we deliberately are not

**In scope (across 7 phases):** text posts, photo carousels, polls, shared-wrap
posts; likes; comments (flat + one level of replies, likeable, `@mentions`);
share (to a Mello DM, external share sheet, copy link); a per-post
Public/Friends visibility model; a hybrid ranked feed with KYC-gated cross-city
virality; a city events rail woven in; a Profile **Posts** tab; coalesced
notifications; strict moderation on the existing block/report rails.

**Explicitly deferred (named so nobody re-scopes silently):**

- **Reshare / retweet into feed** — cut entirely. Share is DM + external + copy
  link only.
- **Video** — photos only in v1. Video (upload, transcode, thumbnails,
  autoplay-on-scroll, mute) is its own future system.
- **Bookmarks / saved collection** — a later phase, not the launch loop.
- **Editing a post** — delete-only in v1. Edit is a fast-follow.
- **Ghost mode** — treated as a **no-op** here (no special-casing). Retiring or
  rebuilding ghost mode is a *separate* change, not bundled into this redesign
  (AGENTS.md: don't mix a refactor into a redesign).
- **Feed realtime** — the feed does not live-subscribe. Realtime is scoped to
  the open comment sheet and to live counts on a post you're actively viewing.

---

## 3. Decisions log (the grill, resolved)

Every one of these was stress-tested and settled before writing:

1. **Audience:** city-wide nearby **+** friends, and **popular *posts*** (not
   events) can surface **cross-city**. Events stay city-local.
2. **Event discovery:** woven into Community as a **city rail**, not retired,
   not peer cards (§8).
3. **Data model:** a **new generic `posts` system**, not an extension of the
   wrap-photo tables. Wraps are *referenced*, never merged.
4. **Safety posture:** **strict**, reusing the existing `blocks` / `reports`
   rails; blocking scrubs Community from every feed via `DISCOVERY_FEED_KEYS`.
5. **Visibility:** **per-post `Public` | `Friends`** (§5). Only Public posts are
   cross-city eligible and shareable externally.
6. **Cross-city virality is gated** (§7): author must be **KYC-verified**, the
   post must clear a **velocity/age** floor, and **N distinct reports auto-hide**
   it pending review.
7. **Cold start:** a **fallback ladder** in the ranking RPC guarantees the feed
   is never empty (§6).
8. **Ranking:** **hybrid materialized score**, **keyset** (cursor) pagination —
   never offset (§6).
9. **Post types:** text, photo carousel, poll, shared-wrap (§5).
10. **Comments:** flat top-level **+ one level of replies**, each **likeable**,
    `@mentions`; top-level ranked by **relevancy**, replies chronological;
    two-sided moderation (§9).
11. **Notifications:** **coalesced on write** ("Maya and 340 others…"),
    throttled push (§10).
12. **Polls:** **one vote/user (DB-enforced)**, **locked once cast**,
    **hidden-until-voted**, anonymous, timed (§5.3).
13. **Profile:** a **Posts** tab with **Grid | List** toggle, **viewer-scoped**
    visibility (§11).
14. **Compose entry:** a **top-right header button** (no FAB — resolves
    DESIGN.md §7's open coral-FAB question by removing it).

---

## 4. Architecture at a glance

```
app/(tabs)/community.tsx        ← renamed route (was explore.tsx)
  └── CommunityFeed (FlatList, keyset-paginated infinite query)
        ├── ComposeHeaderButton  → Compose picker Sheet → per-type composer
        ├── NudgeCard (cold-start, dismissible+recurring)
        ├── PostCard (switches on post.type)
        │     ├── TextPost / PhotoPost / PollPost / SharedWrapPost
        │     └── PostActionBar (like · comment · share)
        ├── EventsRail (every ~8–10 posts, city-only)
        └── "new posts ↑" pill

Services (src/services/community/)
  posts.service · comments.service · polls.service · postLikes.service
Hooks (src/hooks/)
  useCommunityFeed · usePostInteractions · useComments · usePoll · useMyPosts
Query keys (src/constants/queryKeys.ts)
  community.feed / post / comments / poll  (feed added to DISCOVERY_FEED_KEYS)
Backend (supabase/migrations/NNN_community_*.sql)
  tables + RLS + ranking RPC + moderation triggers + coalescing notif fn
```

Each unit has one job and a defined interface: the ranking RPC owns "what
appears and in what order," services own "read/write one entity," hooks own
"cache + optimism," `PostCard` owns "render one post," composers own "author one
post." A change inside any one shouldn't reach the others.

---

## 5. Data model

New tables (exact columns finalized in each phase's plan; migration numbers
continue the existing sequence). **All access is RLS-guarded**; the client is
never trusted for visibility, vote-uniqueness, or moderation.

### 5.1 `posts`

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `author_id` | → profiles |
| `type` | `'text' \| 'photo' \| 'poll' \| 'shared_wrap'` |
| `visibility` | `'public' \| 'friends'` — **present from Phase 1** |
| `body` | text caption/content (nullable for pure-media) |
| `media` | `text[]` of storage URLs (photo posts) |
| `ref_wrap_event_id` | → events, for `shared_wrap` posts |
| `city` | denormalized author city at post time (feed scoping) |
| `like_count`, `comment_count` | denormalized counters (trigger-maintained) |
| `score`, `hot_since` | **materialized** ranking columns (§6) |
| `hidden`, `hidden_reason` | moderation auto-hide (§7) |
| `created_at` | |

Poll data lives in `polls` / `poll_options` / `poll_votes` (§5.3), keyed by
`post_id`.

### 5.2 The four post types

- **Text** — `body` only, char-capped (e.g. 280). Cheapest; seeds the feed.
  Rendered on a `panel`-tier glass card.
- **Photo** — 1–N images (`media[]`) in a swipeable carousel + caption with
  `@mentions`. Reuses `PhotoGridPicker` + the storage pipeline. On-photo chrome
  (dots, counter) uses the **`onPhoto`** dark glass tier.
- **Poll** — `body` question + 2–4 options; see §5.3.
- **Shared wrap** — references an existing wrap (`ref_wrap_event_id`); renders a
  top-photos grid preview + title, taps through to the wrap. Only the
  host/attendees of that event may create one (RLS).

### 5.3 Polls (integrity is load-bearing)

- `poll_votes` has a **unique constraint `(poll_id, user_id)`** — the real
  guard; the UI's disabled state is cosmetic.
- **Locked once cast** (no changing) — kills last-minute swing manipulation.
- **Results hidden until you vote**; on vote the bars animate in.
- **Anonymous** — aggregate counts only, never who-voted-what.
- **Timed** — author picks 1 / 3 / 7 days at compose; after expiry the poll is
  read-only. `poll_closed` notifies **only the author** with the winner.
- Voting respects post **visibility** (only viewers who can see it can vote).

---

## 6. Feed & ranking

**Hybrid score, materialized, keyset-paginated.**

- A per-post **`score`** column is refreshed on a cadence (trigger/cron), the
  same shape as the existing `explore_feed()` score. It is **not** recomputed
  per request — so ordering is frozen within a scroll session and pages cannot
  reshuffle (the class of bug migration `010` patched).
- **Keyset pagination**: the RPC returns rows *after* a `(score, created_at, id)`
  cursor. **Never offset** — offset over a moving ranking dupes and gaps.
- **Score inputs:** recency · friend affinity · same-city · **virality**
  (like/comment velocity from *distinct* users). Events: city-only. Posts: can
  cross city (§7).

**Cold-start fallback ladder** (inside the one RPC, so the feed is structurally
never empty):

1. Friends' posts (any city, per visibility)
2. Your city's public posts
3. **Cross-city popular public posts** — always has content; the backstop
4. Woven-in city events rail (§8)

When higher tiers are thin, lower tiers backfill to fill the page — underflow
discipline applied up front, not patched later. A **dismissible+recurring**
"find friends / post something" nudge card sits at the top for users under a
friend threshold; it retires permanently once they post once or cross the
threshold. A true global-zero state shows "Be the first in {city}."

**No feed realtime.** Pull-to-refresh + refetch-on-focus; a **"new posts ↑"**
pill appears when a refetch finds content newer than your top. Likes/votes are
**optimistic with rollback** (the `useEventParticipation` factory pattern),
counts reconciled on refetch.

**Cache:** `queryKeys.community.feed.of(userId, scope, filter)` — **added to
`DISCOVERY_FEED_KEYS`** so block/unblock scrubs Community, or a blocked user
lingers exactly like the bug that "already happened twice."

---

## 7. Safety & moderation (strict, on existing rails)

The ranking algorithm is also an abuse-distribution algorithm — virality
rewards early engagement with reach *before* a human sees anything. Three gates,
all cheap, all reusing existing infra:

1. **Cross-city eligibility gate:** a post enters the cross-city candidate pool
   **only if the author is `kyc_status === 'approved'`**. The local city+friends
   feed stays open to everyone; only *amplification beyond your city* requires
   the accountability of a verified ID. Turns existing KYC into the reach
   governor.
2. **Report-threshold auto-hide:** **N distinct reports** (≈3) in a window
   **auto-hides** a post from all feeds pending review — a **DB trigger**, no
   human in the loop. Reuses the `reports` table.
3. **Velocity/age floor:** a post needs minimum age + engagement from **multiple
   distinct people** before it's cross-city eligible, so a ring can't instantly
   rocket something out.

Plus the baseline: **blocking** scrubs posts and comments both ways
(`DISCOVERY_FEED_KEYS` + RLS), **report** on every post and comment, RLS
enforces who can see/comment/vote. Friends-only posts are physically
un-amplifiable (not in the public pool, not externally shareable).

---

## 8. Events in the feed

Events are a **distinct module, not peer cards**, so "community = people"
survives:

- A single **"Happening in {city} ↗"** horizontal rail (swipeable event cards)
  injected roughly **every ~8–10 posts**, always **your city**, regardless of
  where surrounding posts came from.
- Reuses the existing event card + `openEvent(id)` → global event sheet
  plumbing; tap-through is identical to today.
- **Data-driven:** no nearby events → the rail is simply absent (no empty
  shelf), feed closes up. **Never cross-city** — a viral out-of-city post does
  not drag that city's events in.

---

## 9. Comments

- **Shape:** flat top-level **+ one level of replies**; each comment (top-level
  and reply) is **likeable**; `@mentions` autocomplete from friends + people in
  the thread, resolve to a real profile, tap through, fire a **batched**
  `mention` notification.
- **Ordering:** top-level ranked by **relevancy** (likes + reply count +
  recency; post-author's own replies and your friends boosted — "Top comments").
  Replies chronological (oldest-first) under their parent.
- **Who can comment:** anyone who can *see* the post (RLS-enforced).
- **Moderation (two-sided):** comment author deletes their own; **post author**
  deletes/hides *any* comment on their post and can **turn comments off** on a
  post; **report** on any comment. Deleting a parent with replies **tombstones**
  it ("comment removed") and keeps replies readable; deleting a leaf just
  removes it. Blocked users' comments hidden both ways.
- **Surface:** a bottom `Sheet`; realtime while open. Reuses the wrap-comment
  data shape (`WrapPhotoComment` → generalized `PostComment`).

---

## 10. Notifications (coalesced)

A viral post is a self-DDoS on the notifications table if it's one row per like.

- **Coalesce on write:** likes/comments aggregate into a **single row per
  (post, type)** in a rolling window — "Maya and 340 others liked your post" —
  storing actor preview + count in the existing `payload` json; an upsert bumps
  the count rather than inserting. This is the one genuinely new notification
  primitive.
- **New types (reuse the pipeline):** `post_liked`, `post_commented`,
  `comment_liked`, `comment_reply`, `poll_closed`. **`mention` already exists —
  reuse it.** DM-shares ride existing `new_message`.
- **Push throttled:** first event pushes; coalesced bumps update silently within
  the window (reuses `send-push-notification`). Never notify your own actions;
  respect blocks.

---

## 11. Profile "Posts" tab

- **Grid | List** segmented toggle. **Grid** = photo posts only, 3-column,
  Instagram aesthetic. **List** = *all* types chronologically as compact cards
  (nothing hidden).
- **Viewer-scoped visibility:** stranger → Public only; accepted friend →
  Public + Friends; you → everything, with a lock glyph on Friends-only ones.
- Delete/edit reachable from a post's overflow menu, one code path in feed and
  profile. Slots in as one new tab, not a profile rewrite.

---

## 12. UI / UX — glass, motion, haptics, spacing

Built on the existing system (DESIGN.md is the law); **no new glass tier** —
if a surface isn't chrome/panel/onPhoto, that's a decision to name, not invent.

**Glass & composition**
- Feed runs **transparent over the single `<AppBackground>`** (like every tab).
- **Text / poll / shared-wrap cards:** **`panel`** tier (rgba white .68,
  blur 28), radius `2xl`(20)–`3xl`(24), ink contents.
- **Photo posts:** the photo is the hero; on-photo chrome (carousel dots,
  index counter, mention pills) uses **`onPhoto`** smoked-dark glass with white
  contents + the light hairline (DESIGN.md §3).
- **Compose picker & comment sheet:** the existing `Sheet` (glass).
- **Generous spacing** — the brief is "not congested." Cards get real breathing
  room (`SPACING` gaps ≥ the event feed's), a calm one-column rhythm; glass is
  used as *punctuation* (cards, sheets, the events rail), not wall-to-wall.
  Android's flat-glass fallback (DESIGN.md §7) means layout/edge/shadow must
  carry the design without the blur.

**Motion** (Reanimated, timings in `constants/motion.ts`)
- **Feed entrance:** staggered `FadeInDown` per card (the pattern already in
  `explore.tsx`), capped stagger so deep scroll doesn't lag.
- **Like:** spring scale-pop on the heart + a subtle count roll; optimistic, so
  it fires instantly.
- **Poll vote:** options collapse into result **bars that grow from 0** with a
  spring, percentages counting up; hidden-until-voted so the reveal is the
  reward.
- **Carousel:** paged horizontal scroll, dots interpolate with offset.
- **Comment sheet:** standard `Sheet` spring; new comment animates in at top of
  its rank slot.
- **"New posts ↑" pill:** drops from under the header, springs; tap scrolls to
  top + refetch.
- **Compose picker:** `Sheet` rows stagger in.

**Haptics** (`expo-haptics`, matching the tab-bar vocabulary)
- `impactAsync(Light)` on like, on carousel page change, on poll vote tap.
- `impactAsync(Medium)` on post publish success and on opening the compose
  picker.
- `selectionAsync()` on segmented toggle (Grid/List) and poll option focus.
- `notificationAsync(Success/Error)` on publish success / failure.
- Destructive confirms (delete post/comment, report, block) route through the
  existing `Dialog`.

---

## 13. Phasing

Each phase **independently ships, typechecks (0 errors), tests green, and gets a
device check (Android specifically) before the next.** No phase mixes a refactor
with a redesign.

| Phase | Ships | Rationale |
|---|---|---|
| **1 — Feed spine + text posts** | `posts` table (w/ `visibility` from row one), city+friends **keyset** feed RPC + fallback ladder, route rename → Community, top-right compose → text composer, glass feed cards, empty/nudge states, block scrubbing (`DISCOVERY_FEED_KEYS`), query keys | Thinnest end-to-end slice — post & scroll, no media. |
| **2 — Interactions** | Likes (optimistic), comments (flat + 1-level replies, relevancy-ranked, likeable, mentions), two-sided comment moderation, **coalesced notifications** | The social loop, proven on cheap text posts. |
| **3 — Photos + Profile** | Carousel compose (PhotoGridPicker + storage), caption mentions, Profile **Posts** tab (Grid\|List, viewer-scoped) | Media + a home for your posts. |
| **4 — Polls** | Compose modal, DB-enforced voting, hidden-until-voted results animation, `poll_closed` notif | Self-contained. |
| **5 — Shared wraps** | Reshare a wrap gallery as a post referencing existing wrap data | Ties Community back to events. |
| **6 — Virality + events rail** | Hybrid score, cross-city KYC-gated pool, velocity cap + auto-hide triggers, "popular beyond your city," city events rail | Capstone ranking; needs real content to tune. |
| **7 — Share + deep links** | Send-to-DM, external share sheet, copy link, `/p/:id` deep links | Distribution once posts are worth sharing. |

---

## 14. Testing

Reanimated 4 blocks component tests (AGENTS.md), so logic is tested by
extraction, not rendering:

- **Ranking / fallback-ladder** SQL: seeded fixtures asserting order, cross-city
  gating, underflow backfill, keyset cursor stability.
- **Vote uniqueness / lock:** DB constraint + RPC tested directly.
- **Coalescing notification fn:** upsert-bumps-count asserted.
- **Mutation option factories** (like/comment/vote) as plain factories, driven
  without a renderer — the `participationMutations` pattern.
- **Moderation:** block scrubs Community feed key; auto-hide trigger fires at
  threshold.
- Device checks per phase for anything visual (Android first — glass fallback,
  SafeAreaView no-op).

---

## 15. Risks & open threads

- **Score refresh cadence** (trigger vs cron vs on-write debounce) — tune in
  Phase 6 against real volume; Phases 1–5 can use a simple recency+affinity
  score with the materialized column already in place.
- **Route rename** (`explore.tsx` → `community.tsx`): update `TAB_ROUTES`,
  `+native-intent.ts`, and any deep links; keep a redirect if `/explore` is
  referenced externally.
- **Android glass** cost inside a long list — lean on `panel` sparingly and the
  flat fallback; verify scroll perf on device.
- **Cross-city moderation review queue** — auto-hide is automated; the
  *human review* side (who clears an auto-hidden post) is an ops question, not
  built in v1; flag before Phase 6.
```
