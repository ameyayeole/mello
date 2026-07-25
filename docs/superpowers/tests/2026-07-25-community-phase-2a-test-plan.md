# Community Phase 2a — Likes + Action Bar — Test Plan

> Scope: the shipped Phase 2a slice — `post_likes` table + count trigger +
> coalesced `post_liked` notification (migration 046), `community_feed`'s new
> `liked_by_me` column (047), `postLikes.service`, the `usePostInteractions`
> optimistic-like factory, and the `PostActionBar` (like · comment-entry ·
> share-placeholder) wired into `PostCard`. Comments, comment-likes, mentions and
> comment moderation are **Phase 2b** — not covered here.

Testing reality (AGENTS.md): Reanimated 4 throws under Jest — no render tests.
Logic is tested by extraction; SQL is verified by hand in the Supabase SQL
editor; visuals get a device check, **Android first**.

---

## A. Automated tests (must stay green)

```sh
npm run typecheck   # expect 0 errors
npm test            # expect green — 169 tests at time of writing, incl. the two new suites
npm run lint        # expect no NEW errors beyond the pre-existing 95 / 16
```

> Note on running Jest: hook tests import `useAuthStore`, which opens a
> supabase session-refresh handle, so Jest prints "did not exit one second
> after…" and lingers. It is **not** a failure — the suite passes and exits 0.
> Use `npx jest --forceExit` for a clean local exit.

New suites and what each pins down:

| Suite | Asserts |
|---|---|
| `src/services/community/__tests__/postLikes.service.test.ts` | `likePost` inserts `{post_id,user_id}` into `post_likes` and throws on error; `unlikePost` deletes by `post_id` **then** `user_id` (two chained `.eq()`) and throws on error. |
| `src/hooks/__tests__/usePostInteractions.test.ts` | `patchPostInFeed` applies the patch only to the matching post across pages and keeps untouched pages referentially stable. `likeMutations.toggle` routes to `likePost`/`unlikePost` by `liked`; optimistically flips `liked_by_me` + moves `like_count` (flooring at 0); rolls the cache back on error. |

**Accepted coverage gaps (deliberate):** the `PostActionBar` render, the heart
spring-pop, and the coalescing SQL have no automated coverage — see B and C.

---

## B. Database / RLS verification (Supabase SQL editor)

Run **migrations 046 then 047**, in order. Seed two auth users **A** and **B**
(not friends) and a text post `postA` authored by **A**.

### B1. Count trigger (+1 / −1, floors at 0)
```sql
INSERT INTO post_likes (post_id, user_id) VALUES ('<postA>', '<B>');
SELECT like_count FROM posts WHERE id = '<postA>';   -- expect 1
DELETE FROM post_likes WHERE post_id = '<postA>' AND user_id = '<B>';
SELECT like_count FROM posts WHERE id = '<postA>';   -- expect 0 (GREATEST floor)
```

### B2. Coalescing — two likers collapse to one bumped row
```sql
INSERT INTO post_likes (post_id, user_id) VALUES ('<postA>', '<B>');
INSERT INTO post_likes (post_id, user_id) VALUES ('<postA>', '<C>');
SELECT count(*)                       AS rows,
       max((payload->>'count')::int)  AS bumped,
       jsonb_array_length(max(payload)->'actors') AS actor_names
FROM notifications
WHERE recipient_id = '<A>' AND type = 'post_liked'
  AND (payload->>'post_id')::uuid = '<postA>';
-- expect: rows = 1, bumped = 2, actor_names = 2 (capped at 3).
```

### B3. Self-like never notifies
```sql
INSERT INTO post_likes (post_id, user_id) VALUES ('<postA>', '<A>');  -- A likes own post
SELECT count(*) FROM notifications
WHERE recipient_id = '<A>' AND type = 'post_liked'
  AND (payload->>'post_id')::uuid = '<postA>' AND created_at > NOW() - INTERVAL '1 min';
-- expect: 0 new rows attributable to the self-like.
```

### B4. Fresh row after read (window reopens)
Mark the coalesced row read, then like again as a new user → expect a **second**
`post_liked` row (not a bump), because the bump only targets an unread, in-window
row.
```sql
UPDATE notifications SET is_read = TRUE
WHERE recipient_id = '<A>' AND type = 'post_liked' AND (payload->>'post_id')::uuid = '<postA>';
INSERT INTO post_likes (post_id, user_id) VALUES ('<postA>', '<D>');
SELECT count(*) FROM notifications
WHERE recipient_id = '<A>' AND type = 'post_liked' AND (payload->>'post_id')::uuid = '<postA>';
-- expect: 2 rows total (one read, one fresh).
```

### B5. RLS — can't like an unseen post
As **B** (not a friend of A), try to like A's **friends-only** post:
```sql
INSERT INTO post_likes (post_id, user_id) VALUES ('<friendsOnlyPostA>', '<B>');
-- expect: violates the WITH CHECK (post_id IN (SELECT id FROM posts)) — posts RLS
-- hides the row from B, so the insert is rejected.
```

### B6. `liked_by_me` correctness (feed RPC v2)
```sql
INSERT INTO post_likes (post_id, user_id) VALUES ('<postA>', '<A>');
SELECT id, liked_by_me FROM community_feed('<A>', NULL, NULL, 50) WHERE id = '<postA>'; -- true for A
SELECT id, liked_by_me FROM community_feed('<B>', NULL, NULL, 50) WHERE id = '<postA>'; -- false for B (hasn't liked)
```

### B7. Push fires once, bumps stay silent
With a real device/push token on **A**: the **first** like on `postA` delivers a
push ("X liked your post"); a **second** like within the window updates the row
silently (no second push). Verified via the AFTER INSERT `push_notification_fanout`
firing on the INSERT but not on the coalescing UPDATE.

---

## C. Manual device QA (Android first, then iOS)

1. **Heart fill + count.** Tap the heart on any post → it fills (bold glyph, coral)
   instantly, a Light haptic fires, a subtle spring-pop plays, and the count
   appears/increments — before the network resolves.
2. **Unlike.** Tap again → heart empties, count decrements (never below 0).
3. **Rollback.** Kill the network, tap like → the optimistic fill rolls back to
   empty when the mutation fails (no stuck filled heart).
4. **Persistence on scroll.** Like a post, scroll far past it and back → the
   filled state and count persist; the feed does **not** reshuffle or jump (no
   invalidate-on-like).
5. **Coalesced notification.** From **B** and **C**, like **A**'s post. On A's
   device: **one** notification row ("B and 1 other liked your post"); the first
   like pushes, the second does not.
6. **No self-notify.** A likes A's own post → no notification to A.
7. **Comment + share affordances.** The comment glyph shows the comment count and
   is tappable (opens nothing yet — Phase 2b); the share glyph is visibly disabled
   (dimmed), holding the footer geometry.
8. **Android glass.** On Android the card's flat-glass fallback still frames the
   action bar cleanly; the heart/haptic/pop all work without blur.

---

## Exit criteria

Phase 2a is done when **A** is green (0 typecheck, tests pass, no new lint),
**B1–B7** pass in the SQL editor after running 046+047, and **C1–C8** pass on an
Android device (spot-checked on iOS). Record any Android glass/haptic notes in the
PR summary.
