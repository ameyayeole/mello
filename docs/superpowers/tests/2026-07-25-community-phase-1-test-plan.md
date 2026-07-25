# Community Phase 1 — Test Plan

> Scope: the shipped Phase 1 slice — `posts` table + RLS (044), `community_feed`
> keyset RPC (045), `posts.service`, `useCommunityFeed`, `usePostMutations`, the
> `PostCard`/nudge/composer components, and the `explore → community` tab rename.
> Phase 1 is **text posts only** — likes, comments, media, polls, wraps, ranking
> and virality are out of scope and belong to later phases' test plans.

Testing reality (AGENTS.md): Reanimated 4 throws under Jest, so there is **no
render/component coverage**. Logic is tested by extraction; SQL is verified by
hand in the Supabase SQL editor with seeded rows; anything visual gets a device
check, **Android first** (`SafeAreaView` is a no-op there, glass falls back to a
flat fill).

---

## A. Automated tests (must stay green)

Run from repo root:

```sh
npm run typecheck   # expect 0 errors
npm test            # expect green
npm run lint        # expect no NEW errors beyond the pre-existing 95 / 16
```

Phase 1 suites and what each pins down:

| Suite | Asserts |
|---|---|
| `src/services/community/__tests__/posts.service.test.ts` | `getCommunityFeed` sends null cursor params on page 1; forwards `{createdAt,id}` on later pages; throws on RPC error. `createTextPost` trims the body and inserts `author_id/type/visibility/city`, returns the new id. |
| `src/hooks/__tests__/useCommunityFeed.test.ts` | `nextCommunityCursor` returns `undefined` for a short page and for an empty page (paging stops); returns the last row `{createdAt,id}` for a full page. |
| `src/hooks/__tests__/usePostMutations.test.ts` | `postMutations.create` calls `createTextPost` with author+city+payload and invalidates `queryKeys.community.feed.all` on success; `postMutations.remove` calls `deletePost(id)`. |

**Coverage gaps to accept for Phase 1** (not bugs — deliberate, per the testing
reality above): the FlatList screen, the compose sheet UI, the delete `Dialog`,
the `FadeInDown` stagger, and the glass rendering have **no** automated coverage.
They are covered by Section C.

---

## B. Database / RLS verification (Supabase SQL editor)

These prove the parts `tsc` cannot see — RLS visibility, keyset stability and
block scrubbing. **Run as the real roles**, not service-role-only, or RLS is
never exercised. Seed with two auth users **A** and **B** who are **not** friends.

### B1. Schema + RLS is on
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'posts' ORDER BY ordinal_position;      -- all columns present
SELECT relrowsecurity FROM pg_class WHERE relname = 'posts'; -- expect: true
```

### B2. Visibility (the friends-only branch)
```sql
-- Seed (service role): A public + A friends-only.
INSERT INTO posts (author_id, type, visibility, body, city)
VALUES ('<A>', 'text', 'public',  'A public',  'Mumbai'),
       ('<A>', 'text', 'friends', 'A friends', 'Mumbai');
```
- As **B** (not a friend): `SELECT count(*) FROM posts WHERE author_id='<A>'` → **1** (public only).
- As **A**: same query → **2**.
- Accept A↔B friendship, re-run as **B** → **2** (now sees the friends-only one).

**Fail signal:** B ever seeing the friends-only post before accepting → the
friends branch of `posts_select` is broken. Fix before shipping.

### B3. Keyset pagination — no dupes, no gaps
```sql
-- Seed ~5 public posts, then:
SELECT id, created_at FROM community_feed('<A>', NULL, NULL, 2);        -- page 1
SELECT id, created_at FROM community_feed('<A>', '<p1_last_created_at>', '<p1_last_id>', 2); -- page 2
```
Page 2 rows are strictly older than page 1's last row; **no id appears in both
pages**. A repeat means the `(created_at,id) < (cursor)` comparator is wrong.

### B4. Block scrubbing through the RPC
```sql
INSERT INTO blocks (blocker_id, blocked_id) VALUES ('<B>', '<A>');
SELECT count(*) FROM community_feed('<B>', NULL, NULL, 50) WHERE author_id = '<A>'; -- expect: 0
```
Also confirm the reverse (A blocks B) hides B's posts from A. Proves the RPC
honours `posts` RLS (`SECURITY INVOKER`). Clean up the block row afterward.

### B5. Text-post body constraint
```sql
INSERT INTO posts (author_id, type, visibility, body, city)
VALUES ('<A>', 'text', 'public', '   ', 'Mumbai'); -- expect: violates posts_text_has_body
```
A whitespace-only or null body for `type='text'` must be rejected by the CHECK.

---

## C. Manual device QA (Android first, then iOS)

Reanimated / glass / `SafeAreaView` can't be unit-tested. Walk this on a device.

1. **Tab rename.** The tab bar shows **Community** where Explore was; the glyph
   renders; the travelling indicator still lands on it at index 1.
2. **Feed shell.** Opening the tab shows the feed (or empty state) over the
   drifting `AppBackground`. **Cards are glass, spacing is roomy, no horizontal
   scroll** anywhere. On Android confirm the flat-fill fallback still reads
   (edge/shadow/layout carry it without blur).
3. **Compose open.** Top-right **+** → medium haptic, sheet opens, keyboard
   autofocuses.
4. **Publish.** Type a body, toggle **Friends/Public** (selection haptic), tap
   **Post** → success haptic, sheet closes, the post appears at the **top** of
   the feed after refetch. Counter blocks empty and >280-char bodies.
5. **Visibility end-to-end.** From **A** post one Public + one Friends. From
   **B** (not friends) only the Public one appears; after friending, both do.
6. **Pagination.** With >10 posts, scrolling loads more with **no duplicates and
   no gaps** (the B3 check, live). Footer spinner shows while fetching.
7. **Pull-to-refresh** works and a newly posted item surfaces at top.
8. **Delete own post.** Overflow on your own post → confirm `Dialog` → success
   haptic, the post disappears, feed re-reads. Overflow does **not** offer delete
   on someone else's post.
9. **Block scrubbing (live).** Block A from B (via profile) → A's posts vanish
   from B's Community feed without a manual refresh (proves `community.feed.all`
   is in `DISCOVERY_FEED_KEYS`).
10. **Nudge card.** Shows for a thin feed (<3 posts), dismisses for the session,
    and is suppressed while the feed is in its error state.
11. **Empty + error states.** With zero visible posts → "Nothing here yet / Be
    the first". Kill the network → error EmptyState with a working **Retry**.
12. **Entrance motion.** The `FadeInDown` stagger plays on scroll-in and is
    capped so deep scroll doesn't lag.

---

## D. Regression checks (the rename's blast radius)

- **Deep links:** `mello://post/<id>` routes to `/(tabs)/community` (Phase 7
  will give it a real detail screen). No dangling `/explore` navigations remain
  (grep: `rg "'/explore'|\"/explore\"|/explore\b" app src`).
- **`DISCOVERY_FEED_KEYS`** includes `queryKeys.community.feed.all` — without it,
  block/unblock silently leaves a blocked user's posts on screen (the bug that
  "already happened twice").
- **Tab index / drag:** the floating tab bar's pickup/drag indices still map to
  Community at slot 1 (`app/(tabs)/_layout.tsx`).

---

## Exit criteria

Phase 1 is verifiably done when: **A** is green (0 typecheck errors, tests pass,
no new lint), **B1–B5** pass in the SQL editor, and **C1–C12** pass on an Android
device (then spot-checked on iOS). Record any Android-specific glass/layout notes
in the PR summary; "untested on X" beats confident silence.
