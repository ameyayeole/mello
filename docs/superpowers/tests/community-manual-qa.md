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
- [ ] **Delete own:** overflow (dots) on your comment → Alert confirm → gone (or "comment removed" if it had replies, with replies still shown).
- [ ] **Post-author moderation:** as the post author, the overflow shows on **anyone's** comment and deletes it; the **Turn off / Turn on** header control flips comments — when off, the composer is replaced by "Comments are turned off" (and others can't comment).
- [ ] **Profile tap:** a commenter's avatar/name opens their profile (`/friends/[id]`).
- [ ] **Keyboard:** the composer stays above the keyboard (Android adjusts; iOS via `keyboardAvoiding`); list scrolls within its cap; tapping a row while typing doesn't dismiss mid-send (`keyboardShouldPersistTaps`).
- [ ] **Notifications:** `post_commented`/`comment_reply` rows read "commented on your post" / "replied to your comment" (coalesced forms too) and tap through to the feed.

## Phase 2c — Comment likes + reporting

### DB (SQL editor) — after running migrations 052, 053, 054
Reuse A/B/C, `postA` by A, and a comment `c1` by B.

- [ ] **Comment like count:** like `c1` as A → `post_comments.like_count` = 1; unlike → 0 (floors, never negative).
- [ ] **Coalesced `comment_liked`:** A then C like B's comment → **one** `comment_liked` row for **B**, `count` 2.
- [ ] **Self-like:** B likes own comment → no `comment_liked` row to B.
- [ ] **RLS:** liking a comment on a post you can't see is rejected by the WITH CHECK.
- [ ] **`liked_by_me`:** `post_comments_ranked(postA, A, 100)` → `liked_by_me` true for a comment A liked, false otherwise; same in `post_comment_replies`.
- [ ] **Ranking:** a comment with more **likes** now floats up (like_count folded into the score alongside replies + author/friend boosts).
- [ ] **Report row:** as an authenticated user, `INSERT INTO reports (reporter_id, reported_id, comment_id, reason) VALUES (auth.uid(), '<author>', '<c1>', 'spam')` succeeds; `reports.comment_id` / `post_id` columns exist.

### Android device
- [ ] Tap the **heart** on a comment (top-level or reply) → fills coral instantly + Light haptic + subtle pop + count moves, before network.
- [ ] Tap again → unfills, count decrements (never below 0); state persists on reopen.
- [ ] **Report someone else's comment:** overflow (dots) → menu shows **Report** (no Delete) → reason picker (Spam / Harassment / Inappropriate) → "Report sent".
- [ ] **Own comment:** overflow shows **Delete** only (no Report).
- [ ] **Post author on someone else's comment:** overflow shows **both** Delete and Report.
- [ ] The comment's author gets a coalesced **"liked your comment"** notification (first pushes, bumps silent); never on a self-like; tapping it lands on the feed.

## Phase 2d — @mentions

### DB (SQL editor) — after running migration 055
Reuse A/B/C, `postA` by A, comment `c1` by B. Give each a username (A=`alpha`,
B=`bravo`, C=`charlie`).

- [ ] **Resolve on write:** insert a comment by C with body `hey @bravo @alpha` →
  `post_comments.mentions` contains **B and A**, not C (self excluded), deduped.
- [ ] **Case-insensitive:** body `@BRAVO` still resolves to B; unknown `@nobody`
  resolves to nothing (no row added).
- [ ] **Mention notif:** that comment yields a **`comment_mention`** row for B and
  one for A, payload `{ post_id, comment_id }`, **not** coalesced (one per comment).
- [ ] **Precedence — reply:** C replies to B's comment `c1` with `@bravo` in the
  body → B gets **only** `comment_mention` (no `comment_reply`).
- [ ] **Precedence — top-level:** C comments on A's post with `@alpha` → A gets
  **only** `comment_mention` (no `post_commented`).
- [ ] **No mention, normal path intact:** C comments with no `@` → A still gets the
  usual `post_commented`; C replies with no `@` → B still gets `comment_reply`.
- [ ] **Self-mention silent:** A comments `@alpha` on their own post → no row to A.
- [ ] **Tombstone clears:** deleting a comment (body blanked) leaves `mentions = {}`.
- [ ] **RPC username:** `post_comments_ranked(postA, A, 100)` and
  `post_comment_replies(c1, A)` both return `author_username`.

### Android device
- [ ] Typing `@` in the composer opens the people strip. It **live-searches all
  users** (not just friends — works even between non-friend test accounts A/B/C);
  a bare `@` lists people, and it narrows as you type. **Prefix match, not
  substring:** typing `a` shows only handles/names *starting* with `a` (not every
  name containing an `a`); username-prefix hits rank above name-only. Tapping a
  chip inserts the **lowercase** `@handle `.
- [ ] A sent comment shows the `@handle` **highlighted + tappable** → opens that
  person's profile; the highlight survives closing/reopening the sheet (the map
  resolves from the thread, not a session cache); an unknown `@handle` is plain text.
- [ ] **Reply prefill is lowercase — on every Reply:** tapping Reply on a **top-level
  comment** *and* on a **reply** both seed `@handle ` (lowercase username), not the
  capitalised display name; the banner still shows the name.
- [ ] The mentioned person gets a **"[name] mentioned you in a comment"** notification
  (first push delivers; not coalesced); it appears under the **Mentions** filter and
  taps through to the Community feed.
- [ ] Mentioning the parent-comment author in a reply gives them the **mention**
  notification, not a duplicate reply notification.

## Phase 3a — Photo posts

**No DB migration** — `posts.media`/`type='photo'` and `community_feed.media`
already existed (044/045); this is code-only. Storage reuses the public
`event-photos` bucket (016 policies).

### Android device
- [ ] Compose → attach **1** photo, no caption → **Post** enabled; publish shows
  the button **loading during upload**, then the photo post appears at the top.
- [ ] Compose → attach **multiple** photos **+ caption** → carousel swipes paged,
  **Light haptic** on page change, **`i/N` counter** (onPhoto glass) top-right and
  **dots** track the page; caption shows under the photo.
- [ ] **Single** photo shows **no** counter/dots.
- [ ] Caption-less photo post renders with no empty caption line; a text-only post
  (no photos) still posts as before (Post disabled only when both empty).
- [ ] **Android flat-glass:** the counter pill + dots stay legible over the image
  without the blur; no horizontal page scroll of the card itself.
- [ ] Visibility (Friends/Public) still respected for photo posts; **delete-own**
  removes it; a non-friend sees only Public photo posts.
- [ ] Large camera-roll photos upload without the iOS "Message too long" error
  (shared encoder compresses to ≤1280px); order picked = carousel order.


