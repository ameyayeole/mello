# Community — Manual QA (Android device + Supabase DB)

> The single running checklist for everything that can't be unit-tested:
> **Android device checks** (Reanimated / glass / `SafeAreaView` no-op / haptics)
> and **Supabase SQL/RLS checks** (run in the SQL editor as real roles). Grows one
> section per phase. Automated coverage (typecheck / jest / lint) lives in each
> phase's `*-test-plan.md` and is not repeated here.
>
> **Android first** on every device pass — glass falls back to a flat fill and
> `react-native`'s `SafeAreaView` is a no-op there; iOS is a spot-check after.

---

## Phase 1 — Feed spine + text posts

### DB (SQL editor) — after running migrations 044, 045
Seed two auth users **A** and **B** (not friends) + a text post `postA` by A.

- [ ] **Schema/RLS on:** `posts` has all columns; `SELECT relrowsecurity FROM pg_class WHERE relname='posts'` = `true`.
- [ ] **Friends-only visibility:** A posts one `public` + one `friends`. As B (not friend) `SELECT count(*) FROM posts WHERE author_id='<A>'` → **1**; as A → **2**; after friending, as B → **2**.
- [ ] **Keyset no dupes/gaps:** `community_feed('<A>',NULL,NULL,2)` then pass page-1's last `(created_at,id)` as cursor → page 2 strictly older, no id in both.
- [ ] **Block scrubbing:** `INSERT INTO blocks(blocker_id,blocked_id) VALUES('<B>','<A>')` → `community_feed('<B>',…)` returns 0 A-authored rows.
- [ ] **Body constraint:** inserting a whitespace-only `type='text'` body is rejected by `posts_text_has_body`.

### Android device
- [ ] Tab bar shows **Community** where Explore was; glyph renders; travelling indicator lands on it.
- [ ] Feed (or empty state) over the drifting background; cards are glass, roomy, **no horizontal scroll**; Android flat-fill still reads.
- [ ] Compose: top-right **+** → medium haptic, sheet opens, keyboard autofocus.
- [ ] Publish: type body, toggle **Friends/Public** (selection haptic), **Post** → success haptic, sheet closes, post appears at top. Counter blocks empty and >280.
- [ ] Visibility E2E: from A, one Public + one Friends; from B (not friend) only Public shows; after friending, both.
- [ ] Pagination: >10 posts scroll-loads with no dupes/gaps; footer spinner; pull-to-refresh surfaces a new post at top.
- [ ] Delete own post: overflow → confirm Dialog → success haptic, post gone. No delete on others' posts.
- [ ] Block scrubbing (live): block A from B → A's posts vanish from B's feed without manual refresh.
- [ ] Nudge card shows for a thin feed (<3), dismisses for the session, suppressed while in error state.
- [ ] Empty + error states render with a working **Retry**; `FadeInDown` stagger plays and is capped on deep scroll.

---

## Phase 2a — Likes + action bar

### DB (SQL editor) — after running migrations 046, 047
Reuse A/B (+ a third user C) and `postA` by A.

- [ ] **Count trigger:** like as B → `posts.like_count` = 1; delete the like → 0 (floors, never negative).
- [ ] **Coalescing:** B then C like `postA` → **one** `post_liked` notification row for A with `payload.count` = 2 and `actors` length 2 (capped at 3).
- [ ] **Self-like never notifies:** A likes own post → no `post_liked` row to A.
- [ ] **Window reopens:** mark the row `is_read=TRUE`, like as D → a **second** row (not a bump).
- [ ] **RLS:** B (not friend) inserting a like on A's **friends-only** post is rejected by the WITH CHECK.
- [ ] **`liked_by_me`:** `community_feed('<A>',…)` → true for a post A liked; false for the same post as B.
- [ ] **Push once, bumps silent:** with a real push token on A, first like delivers a push; second like within window updates silently (no second push).

### Android device
- [ ] Tap heart → fills (bold coral glyph) instantly + Light haptic + **subtle** pop (no bounce/overshoot) + count appears/increments, before network.
- [ ] Tap again → empties, count decrements (never below 0).
- [ ] Network-kill → optimistic like rolls back to empty (no stuck heart).
- [ ] Like a post, scroll far past + back → state + count persist; **feed does not reshuffle/jump**.
- [ ] Coalesced notification on A's device: "B and 1 other liked your post"; first pushes, second silent.
- [ ] Own-post like → no self-notification.
- [ ] Comment glyph shows the count and is tappable (opens nothing yet — Phase 2b); share glyph visibly disabled.

### Android device — Phase 2a polish fixes
- [ ] Heart pop is calm/subtle (the `damping:8`/1.25 bounce is gone).
- [ ] `post_liked` notification reads **"[name] liked your post"** (not just the name); coalesced form reads "[name] and N others liked your post".
- [ ] Tapping that notification navigates to the Community feed (specific-post landing arrives in Phase 7).
- [ ] Tapping a post author's **avatar or name** in the feed opens their profile (`/friends/[id]`).
- [ ] The **"Community"** header title matches the Notifications header size (large `display`), consistent across tabs.

---

## Phase 2b — Comments (core)

### DB (SQL editor) — after running migrations 048, 049, 050, 051
Reuse A/B/C and `postA` by A.

- [ ] **One-level guard:** insert a top-level comment `c1`, a reply to `c1` → OK; replying to that reply → **ERROR** "comments are one level deep".
- [ ] **Reply post match:** a reply whose `post_id` ≠ its parent's post is rejected.
- [ ] **Count trigger:** top-level + reply → `posts.comment_count` = 2; tombstone the top-level (`UPDATE … SET deleted_at=NOW()`) → 1; hard-delete the reply → 0.
- [ ] **Tombstone body:** the tombstone UPDATE (body blanked) is **not** rejected by the body CHECK (the `deleted_at IS NOT NULL OR …` exemption).
- [ ] **comments-off blocks insert:** `UPDATE posts SET comments_enabled=FALSE` → an authenticated comment insert is rejected by the WITH CHECK.
- [ ] **Ranking:** `post_comments_ranked(postA, viewer, 100)` → top-level only; the comment by the **post author**, by the **viewer's friend**, and with **more replies** float up; recency breaks ties. Tombstoned rows come back `deleted=true`, `body` NULL.
- [ ] **Replies:** `post_comment_replies(c1, viewer)` → chronological asc.
- [ ] **Coalesced comment notif:** B then C comment on A's post → **one** `post_commented` row for A, `count` 2.
- [ ] **Reply notifies parent author:** C replies to B's comment → a `comment_reply` row for **B** (not A).
- [ ] **Self never notifies:** A commenting/replying on their own post/comment → no row to A.

### Android device
- [ ] Tap a post's **comment** glyph → Light haptic, sheet opens; loading → list (or "No comments yet" empty state).
- [ ] Post a comment → appears in the thread, the **card's comment count increments**, composer clears, success haptic.
- [ ] **Reply:** tap Reply → "Replying to X" banner + placeholder switches; send → nested under the parent; **View N replies** expands/collapses (lazy-loads).
- [ ] **Realtime:** with the sheet open, a comment posted from another account appears **live** (no manual refresh).
- [ ] **Delete own:** overflow (dots) on your comment → confirm Dialog → gone (or "comment removed" if it had replies, with replies still shown).
- [ ] **Post-author moderation:** as the post author, the overflow shows on **anyone's** comment and deletes it; the **Turn off / Turn on** header control flips comments — when off, the composer is replaced by "Comments are turned off" (and others can't comment).
- [ ] **Profile tap:** a commenter's avatar/name opens their profile (`/friends/[id]`).
- [ ] **Keyboard:** the composer stays above the keyboard (Android adjusts; iOS via `keyboardAvoiding`); list scrolls within its cap; tapping a row while typing doesn't dismiss mid-send (`keyboardShouldPersistTaps`).
- [ ] **Notifications:** `post_commented`/`comment_reply` rows read "commented on your post" / "replied to your comment" (coalesced forms too) and tap through to the feed.

<!-- Phase 2c (comment likes + reports + mentions) checks appended here when that phase lands. -->

