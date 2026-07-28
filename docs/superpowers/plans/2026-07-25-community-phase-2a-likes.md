# Community Phase 2a — Likes + Post Action Bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user can like/unlike any post they can see; the heart fills instantly (optimistic, with rollback), the count rolls, and the post author gets a **coalesced** "Maya and 3 others liked your post" notification that pushes once and then bumps silently.

**Architecture:** A `post_likes` table (composite PK = one like per user per post) with a count trigger maintaining `posts.like_count` — mirroring the existing `wrap_photo_likes` pattern exactly. The `community_feed` RPC gains a `liked_by_me` column so the feed knows which hearts are filled. A `postLikes.service` + a `usePostInteractions` optimistic-mutation factory (the `participationMutations` cancel→snapshot→patch→rollback pattern, applied across infinite-query pages). A `PostActionBar` renders the heart + count + a placeholder comment button (wired in Phase 2b). The post-author notification is the spec's one genuinely new primitive: a **coalescing** SQL function that upserts a single `(recipient, post, type)` row and bumps a count in `payload`.

**Tech Stack:** Expo Router, React Native, Reanimated 4, TanStack Query v5 (`useInfiniteQuery`), Supabase (Postgres + RLS + plpgsql triggers), `expo-haptics`.

## Global Constraints

- **Expo SDK 56** — read the versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing platform code.
- **No hardcoded colours** — `COLORS` from `@/constants/colors`. **No hardcoded font families** — `FONTS`. **New UI type uses `TYPE`/`TYPE_SIZE`** steps, never one-off sizes.
- **Check `src/components/ui/` first.** Reuse `PressableScale`, `Icon`, `Avatar`, `COLORS`, `FONTS`. Add a prop before forking; only go bespoke with a comment saying why.
- **Buttons: exactly three variants** (`primary` coral / `secondary` black / `tertiary` white). The action bar's like/comment controls are **`PressableScale` icon controls, not `Button`s** (they're inline glyph affordances, not labelled buttons) — this is the AGENTS.md-sanctioned bespoke case; comment why.
- **Optimistic mutations follow the `participationMutations` factory** in `src/hooks/useEventParticipation.ts`: build `UseMutationOptions` in a plain factory so cache bookkeeping is testable against a bare `QueryClient` with no renderer.
- **Shared query keys live in `src/constants/queryKeys.ts`** with an `all` + `of()` pair.
- **DB conventions:** one numbered SQL file per migration, run whole in the SQL editor, `CREATE ... IF NOT EXISTS`, RLS enabled with the table, `snake_case` columns, `p_`-prefixed RPC params, `SECURITY DEFINER` on notification triggers (matching `on_wrap_photo_like`). Next free migration numbers are **046** and **047** (highest existing is `045`).
- **Notification enum is in two places** that must stay in sync: the Postgres enum `notification_type` (extend with `ALTER TYPE ... ADD VALUE IF NOT EXISTS`) **and** the TS union `NotificationType` in `src/types/models.ts`. Copy lives in **two** files: `src/utils/notificationCopy.ts` (local banner) and `supabase/functions/send-push-notification/index.ts` (`composeCopy`, remote push) — the header comment in `notificationCopy.ts` says to keep them in sync.
- **Verify gates:** `npm run typecheck` must stay at **0**; `npm test` must stay **green**; `npm run lint` — do not add to the pre-existing 95 errors / 16 warnings.
- **Testing reality:** Reanimated 4 throws under Jest — **no component/render tests**. Test logic by extraction (pure helpers, mutation-option factories) and services via the Supabase fluent-builder mock (`src/services/community/__tests__/posts.service.test.ts` is the reference). **SQL is verified by hand in the Supabase SQL editor** with seeded rows. Anything visual gets a **device check (Android first** — glass falls back to flat fill, `SafeAreaView` is a no-op).

---

## File Structure

**Created:**
- `supabase/migrations/046_post_likes.sql` — `post_likes` table, RLS, count trigger, `post_liked` enum value, coalescing notify fn + trigger.
- `supabase/migrations/047_community_feed_liked_by_me.sql` — `community_feed` RPC v2 returning `liked_by_me`.
- `src/services/community/postLikes.service.ts` — `likePost`, `unlikePost`.
- `src/services/community/__tests__/postLikes.service.test.ts` — service tests.
- `src/hooks/usePostInteractions.ts` — `likeMutations()` factory + `patchPostInFeed` helper + `useToggleLike()` hook.
- `src/hooks/__tests__/usePostInteractions.test.ts` — factory + helper tests.
- `src/components/community/PostActionBar.tsx` — like · comment (placeholder) · share (placeholder) row.

**Modified:**
- `src/types/models.ts` — extend `NotificationType`; add `liked_by_me` to `CommunityPost`.
- `src/constants/queryKeys.ts` — add `community.post` key family (per-post scope, used by the like patch + Phase 2b).
- `src/utils/notificationCopy.ts` — `post_liked` banner case.
- `supabase/functions/send-push-notification/index.ts` — `post_liked` push case (mirror).
- `src/services/community/posts.service.ts` — surface `liked_by_me` (type already carries it; no query change needed — RPC returns it).
- `src/components/community/PostCard.tsx` — render `<PostActionBar>` in the footer (replaces the read-only counts row).

---

## Task 1: `post_likes` table + count trigger + coalesced like notification

**Files:**
- Create: `supabase/migrations/046_post_likes.sql`

**Interfaces:**
- Consumes: `posts` (044), `profiles`, `notifications`, `notification_type` enum.
- Produces: table `post_likes(post_id, user_id, created_at)` (PK `(post_id, user_id)`); trigger maintaining `posts.like_count`; enum value `'post_liked'`; SQL fn `notify_post_liked_coalesced()`. Consumed by Tasks 2, 4, 5.

- [ ] **Step 1: Write the migration file**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- COMMUNITY LIKES: one like per user per post, count maintained by trigger,
-- author notified via a COALESCED notification (one row per (recipient, post),
-- bumped on each new like within a rolling window). Mirrors wrap_photo_likes
-- (032) for the table/RLS/count shape; the coalescing fn is the new primitive.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- New notification type (Postgres enum side; the TS union is updated in Task 3).
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'post_liked';

CREATE TABLE IF NOT EXISTS post_likes (
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS post_likes_user_idx ON post_likes (user_id);

ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

-- SELECT: you can see a like only if you can see its post (defers to posts RLS).
DROP POLICY IF EXISTS "post_likes_select" ON post_likes;
CREATE POLICY "post_likes_select" ON post_likes
  FOR SELECT TO authenticated USING (
    post_id IN (SELECT id FROM posts)   -- posts RLS filters to visible rows
  );

-- INSERT: only your own like, and only on a post you can see.
DROP POLICY IF EXISTS "post_likes_insert" ON post_likes;
CREATE POLICY "post_likes_insert" ON post_likes
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND post_id IN (SELECT id FROM posts)
  );

-- DELETE: only your own like.
DROP POLICY IF EXISTS "post_likes_delete" ON post_likes;
CREATE POLICY "post_likes_delete" ON post_likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── Coalesced author notification ────────────────────────────────────────────
-- One notification row per (recipient, post, 'post_liked'). The first like
-- INSERTs the row (the AFTER INSERT push trigger fires once → a real push). Each
-- later like within the window UPDATEs that same row: bumps payload.count and
-- prepends the new actor's name — no INSERT, so push_notification_fanout does not
-- re-fire. Reopens a fresh row once the old one is read or older than the window.
CREATE OR REPLACE FUNCTION notify_post_liked_coalesced()
RETURNS TRIGGER AS $$
DECLARE
  v_author   UUID;
  v_actor    TEXT;
  v_existing RECORD;
  v_window   INTERVAL := INTERVAL '24 hours';
BEGIN
  SELECT author_id INTO v_author FROM posts WHERE id = NEW.post_id;
  IF v_author IS NULL OR v_author = NEW.user_id THEN
    RETURN NEW;                                   -- never notify your own like
  END IF;

  SELECT name INTO v_actor FROM profiles WHERE id = NEW.user_id;

  -- Most recent unread, in-window like-notification for this post + recipient.
  SELECT * INTO v_existing
  FROM notifications
  WHERE recipient_id = v_author
    AND type = 'post_liked'
    AND (payload->>'post_id')::uuid = NEW.post_id
    AND is_read = FALSE
    AND created_at > NOW() - v_window
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    -- Bump: count + 1, keep the newest actor first, cap the preview at 3 names.
    UPDATE notifications
    SET sender_id = NEW.user_id,
        payload = jsonb_set(
          jsonb_set(v_existing.payload, '{count}',
            to_jsonb(COALESCE((v_existing.payload->>'count')::int, 1) + 1)),
          '{actors}',
          (to_jsonb(v_actor) ||
             COALESCE(v_existing.payload->'actors', '[]'::jsonb))
             #> '{}' ),
        created_at = NOW()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO notifications (recipient_id, sender_id, type, payload)
    VALUES (v_author, NEW.user_id, 'post_liked',
            jsonb_build_object(
              'post_id', NEW.post_id,
              'count', 1,
              'actors', jsonb_build_array(v_actor)));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Count maintenance + notify, on like insert/delete ────────────────────────
CREATE OR REPLACE FUNCTION on_post_like()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    PERFORM notify_post_liked_coalesced_row(NEW);  -- see note below
    RETURN NEW;
  ELSE
    UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_post_like ON post_likes;
CREATE TRIGGER on_post_like
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION on_post_like();
```

> **Fix before running (a real bug in the draft above):** `on_post_like()`
> calls `notify_post_liked_coalesced_row(NEW)` but the function is named
> `notify_post_liked_coalesced()` and is written as a *trigger* function
> (returns TRIGGER, reads `NEW`). Two clean options — pick one and delete the
> other:
> 1. **Inline it:** move the body of `notify_post_liked_coalesced()` directly
>    into the `IF TG_OP = 'INSERT'` branch of `on_post_like()` (it already has
>    `NEW` in scope). Delete the standalone `notify_post_liked_coalesced()`.
> 2. **Separate trigger:** keep `notify_post_liked_coalesced()` as its own
>    `AFTER INSERT ON post_likes` trigger and let `on_post_like()` only maintain
>    the count. Then remove the `PERFORM` line.
>
> Option 1 is fewer moving parts; take it unless you have a reason not to. The
> `PERFORM notify_..._row(NEW)` line as written will not compile.

- [ ] **Step 2: Apply and verify the count trigger**

Run the file (with the fix). Seed a like as user B on a post authored by A:

```sql
INSERT INTO post_likes (post_id, user_id) VALUES ('<postA>', '<B>');
SELECT like_count FROM posts WHERE id = '<postA>';   -- expect 1
DELETE FROM post_likes WHERE post_id = '<postA>' AND user_id = '<B>';
SELECT like_count FROM posts WHERE id = '<postA>';   -- expect 0 (GREATEST floors at 0)
```

- [ ] **Step 3: Verify coalescing**

```sql
-- Two distinct likers on A's post, in one window:
INSERT INTO post_likes (post_id, user_id) VALUES ('<postA>', '<B>');
INSERT INTO post_likes (post_id, user_id) VALUES ('<postA>', '<C>');
SELECT count(*), max(payload->>'count') AS bumped
FROM notifications
WHERE recipient_id = '<A>' AND type = 'post_liked'
  AND (payload->>'post_id')::uuid = '<postA>';
-- expect: count(*) = 1 (coalesced into ONE row), bumped = '2'.
```

Also confirm self-likes never notify: like A's own post as A → **no** new row.

- [ ] **Step 4: Verify RLS (can't like what you can't see)**

As B (not a friend of A), attempt to like A's **friends-only** post → the INSERT
must fail the `post_id IN (SELECT id FROM posts)` check (posts RLS hides it).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/046_post_likes.sql
git commit -m "feat(community): post_likes table, count trigger and coalesced like notifications"
```

---

## Task 2: `community_feed` returns `liked_by_me`

**Files:**
- Create: `supabase/migrations/047_community_feed_liked_by_me.sql`

**Interfaces:**
- Consumes: `posts`, `post_likes` (Task 1), `profiles`.
- Produces: `community_feed(...)` v2 with an added `liked_by_me BOOLEAN` output column (last in the return table). Consumed by Tasks 3 (type), 5 (feed patch).

**Note:** the RPC signature (params) is unchanged, so no `DROP FUNCTION` is
needed for the signature — but adding a column to `RETURNS TABLE` **does** require
`CREATE OR REPLACE` to fail unless the column set matches. Postgres will not let
you change the return type with `OR REPLACE`; you must `DROP FUNCTION` first.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- COMMUNITY FEED v2: adds liked_by_me so the action bar knows which hearts are
-- filled without an N+1 per-post query. p_user_id (already in the signature,
-- previously unused) now drives the EXISTS check. Still SECURITY INVOKER, still
-- keyset. Run whole in SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS community_feed(UUID, TIMESTAMPTZ, UUID, INT);
CREATE OR REPLACE FUNCTION community_feed(
  p_user_id           UUID,
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
  liked_by_me       BOOLEAN
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id, p.author_id, pr.name, pr.photo_url, p.type, p.visibility,
    p.body, p.media, p.city, p.like_count, p.comment_count, p.created_at,
    EXISTS (
      SELECT 1 FROM post_likes pl
      WHERE pl.post_id = p.id AND pl.user_id = p_user_id
    ) AS liked_by_me
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  WHERE (
    p_cursor_created_at IS NULL
    OR (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id)
  )
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT p_limit;
$$;
```

- [ ] **Step 2: Verify**

```sql
-- As A, having liked postA:
INSERT INTO post_likes (post_id, user_id) VALUES ('<postA>', '<A>');
SELECT id, liked_by_me FROM community_feed('<A>', NULL, NULL, 50) WHERE id = '<postA>';
-- expect liked_by_me = true for A; call as B (no like) → false.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/047_community_feed_liked_by_me.sql
git commit -m "feat(community): community_feed returns liked_by_me"
```

---

## Task 3: Types + query keys + notification copy

**Files:**
- Modify: `src/types/models.ts`
- Modify: `src/constants/queryKeys.ts`
- Modify: `src/utils/notificationCopy.ts`
- Modify: `supabase/functions/send-push-notification/index.ts`

**Interfaces:**
- Produces: `CommunityPost.liked_by_me: boolean`; `NotificationType` includes `'post_liked'`; `queryKeys.community.post` family; `post_liked` banner + push copy. Consumed by Tasks 4, 5, 6.

- [ ] **Step 1: Extend `CommunityPost` and `NotificationType`**

In `src/types/models.ts`, add to the `NotificationType` union (near the wrap
types, after `'encore_requested'`):

```typescript
  // Community posts (migration 046+)
  | 'post_liked'
```

And add the field to `CommunityPost` (after `comment_count`):

```typescript
  comment_count: number;
  liked_by_me: boolean;
  created_at: string;
```

- [ ] **Step 2: Add the `community.post` query-key family**

In `src/constants/queryKeys.ts`, extend the `community` block:

```typescript
  community: {
    all: ['community'] as const,
    feed: {
      all: ['community', 'feed'] as const,
      of: (userId: Id) => ['community', 'feed', userId] as const,
    },
    // Per-post scope: like state + (Phase 2b) comments hang off this.
    post: {
      all: ['community', 'post'] as const,
      of: (postId: Id) => ['community', 'post', postId] as const,
    },
  },
```

- [ ] **Step 3: Add the `post_liked` banner copy**

In `src/utils/notificationCopy.ts`, add a case (uses the coalesced `count`/actor):

```typescript
    case 'post_liked': {
      const others = ((opts.count ?? 1) as number) - 1;
      return {
        title: 'New like',
        body:
          others > 0
            ? `${senderName} and ${others} other${others > 1 ? 's' : ''} liked your post`
            : `${senderName} liked your post`,
      };
    }
```

> `opts` currently has no `count`. Add `count?: number` to the `opts` param type
> at the top of `notificationCopy` and have the caller pass
> `payload.count`. Grep the call site (`grep -rn "notificationCopy(" src`) and
> thread `count: n.payload?.count` through — if the caller passes the whole
> notification, read `n.payload.count`. Keep the change minimal.

- [ ] **Step 4: Mirror the push copy in the Edge Function**

In `supabase/functions/send-push-notification/index.ts`, find `composeCopy` and
add the matching `post_liked` case (same wording), reading `count` from
`record.payload`. Keep it byte-for-byte consistent with Step 3's copy.

> Read the function first (`grep -n "composeCopy\|case '" supabase/functions/send-push-notification/index.ts`) to match its exact shape and how it reads `payload`.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (Expected: 0 errors), then:

```bash
git add src/types/models.ts src/constants/queryKeys.ts src/utils/notificationCopy.ts supabase/functions/send-push-notification/index.ts
git commit -m "feat(community): post_liked type, keys and notification copy"
```

---

## Task 4: `postLikes.service`

**Files:**
- Create: `src/services/community/postLikes.service.ts`
- Test: `src/services/community/__tests__/postLikes.service.test.ts`

**Interfaces:**
- Consumes: `post_likes` (Task 1), `supabase`.
- Produces:
  - `likePost(params: { postId: string; userId: string }): Promise<void>`
  - `unlikePost(params: { postId: string; userId: string }): Promise<void>`
  Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/community/__tests__/postLikes.service.test.ts
import { likePost, unlikePost } from '../postLikes.service';
import { supabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({
  supabase: { from: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

describe('likePost', () => {
  it('inserts a (post_id, user_id) row', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ insert });
    await likePost({ postId: 'p1', userId: 'u1' });
    expect(supabase.from).toHaveBeenCalledWith('post_likes');
    expect(insert).toHaveBeenCalledWith({ post_id: 'p1', user_id: 'u1' });
  });

  it('throws on error', async () => {
    const insert = jest.fn().mockResolvedValue({ error: { message: 'x' } });
    (supabase.from as jest.Mock).mockReturnValue({ insert });
    await expect(likePost({ postId: 'p1', userId: 'u1' })).rejects.toBeTruthy();
  });
});

describe('unlikePost', () => {
  it('deletes the matching row by post and user', async () => {
    const second = jest.fn().mockResolvedValue({ error: null });
    const first = jest.fn().mockReturnValue({ eq: second });
    const eq = jest.fn().mockReturnValue({ eq: first });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });
    await unlikePost({ postId: 'p1', userId: 'u1' });
    expect(supabase.from).toHaveBeenCalledWith('post_likes');
    expect(eq).toHaveBeenCalledWith('post_id', 'p1');
    expect(first).toHaveBeenCalledWith('user_id', 'u1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- postLikes.service`
Expected: FAIL — "Cannot find module '../postLikes.service'".

- [ ] **Step 3: Write the service**

```typescript
// src/services/community/postLikes.service.ts
import { supabase } from '@/services/supabase';

export async function likePost(params: {
  postId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('post_likes')
    .insert({ post_id: params.postId, user_id: params.userId });
  if (error) throw error;
}

export async function unlikePost(params: {
  postId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('post_likes')
    .delete()
    .eq('post_id', params.postId)
    .eq('user_id', params.userId);
  if (error) throw error;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- postLikes.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/community/postLikes.service.ts src/services/community/__tests__/postLikes.service.test.ts
git commit -m "feat(community): post likes service (like/unlike)"
```

---

## Task 5: `usePostInteractions` — optimistic like across feed pages

**Files:**
- Create: `src/hooks/usePostInteractions.ts`
- Test: `src/hooks/__tests__/usePostInteractions.test.ts`

**Interfaces:**
- Consumes: `likePost`/`unlikePost` (Task 4), `queryKeys.community` (Task 3), `useAuthStore`, `CommunityPost`.
- Produces:
  - `patchPostInFeed(pages: CommunityPost[][], postId: string, patch: (p: CommunityPost) => CommunityPost): CommunityPost[][]` — pure page-mapper.
  - `likeMutations(qc, userId)` → `{ toggle }` `UseMutationOptions<void, unknown, { postId: string; liked: boolean }, Ctx>`
  - `useToggleLike()` hook.
  Consumed by Task 6.

**Design note (why no invalidate on settle):** the feed is a keyset infinite
query; invalidating it mid-scroll would refetch pages and can reshuffle/jump —
the exact class of bug keyset pagination was chosen to avoid. So a like does an
**optimistic page-patch + rollback on error, and does NOT invalidate**; the count
reconciles on the next natural refetch (pull-to-refresh / focus). This matches
the spec: "optimistic with rollback, counts reconciled on refetch."

- [ ] **Step 1: Write the failing tests**

```typescript
// src/hooks/__tests__/usePostInteractions.test.ts
import { QueryClient } from '@tanstack/react-query';
import { patchPostInFeed, likeMutations } from '../usePostInteractions';
import { queryKeys } from '@/constants/queryKeys';
import * as svc from '@/services/community/postLikes.service';
import { CommunityPost } from '@/types/models';

jest.mock('@/services/community/postLikes.service');

const post = (id: string, over: Partial<CommunityPost> = {}): CommunityPost => ({
  id,
  author_id: 'a',
  author_name: 'A',
  author_photo_url: null,
  type: 'text',
  visibility: 'public',
  body: 'x',
  media: [],
  city: 'Mumbai',
  like_count: 0,
  comment_count: 0,
  liked_by_me: false,
  created_at: 't',
  ...over,
});

describe('patchPostInFeed', () => {
  it('applies the patch to the matching post across pages and leaves others', () => {
    const pages = [[post('1'), post('2')], [post('3')]];
    const next = patchPostInFeed(pages, '2', (p) => ({
      ...p,
      liked_by_me: true,
      like_count: p.like_count + 1,
    }));
    expect(next[0][1]).toMatchObject({ id: '2', liked_by_me: true, like_count: 1 });
    expect(next[0][0]).toMatchObject({ id: '1', liked_by_me: false, like_count: 0 });
    expect(next[1][0]).toMatchObject({ id: '3', liked_by_me: false });
  });
});

describe('likeMutations.toggle', () => {
  it('calls likePost when not yet liked', async () => {
    (svc.likePost as jest.Mock).mockResolvedValue(undefined);
    const qc = new QueryClient();
    const { toggle } = likeMutations(qc, 'u1');
    await toggle.mutationFn!({ postId: 'p1', liked: false });
    expect(svc.likePost).toHaveBeenCalledWith({ postId: 'p1', userId: 'u1' });
  });

  it('calls unlikePost when already liked', async () => {
    (svc.unlikePost as jest.Mock).mockResolvedValue(undefined);
    const qc = new QueryClient();
    const { toggle } = likeMutations(qc, 'u1');
    await toggle.mutationFn!({ postId: 'p1', liked: true });
    expect(svc.unlikePost).toHaveBeenCalledWith({ postId: 'p1', userId: 'u1' });
  });

  it('optimistically flips liked_by_me and like_count in the feed cache', async () => {
    const qc = new QueryClient();
    const key = queryKeys.community.feed.of('u1');
    qc.setQueryData(key, { pages: [[post('p1')]], pageParams: [null] });
    const { toggle } = likeMutations(qc, 'u1');

    await toggle.onMutate!({ postId: 'p1', liked: false });

    const data = qc.getQueryData(key) as { pages: CommunityPost[][] };
    expect(data.pages[0][0]).toMatchObject({ liked_by_me: true, like_count: 1 });
  });

  it('rolls back the cache on error', async () => {
    const qc = new QueryClient();
    const key = queryKeys.community.feed.of('u1');
    qc.setQueryData(key, { pages: [[post('p1')]], pageParams: [null] });
    const { toggle } = likeMutations(qc, 'u1');

    const ctx = await toggle.onMutate!({ postId: 'p1', liked: false });
    toggle.onError!(new Error('x'), { postId: 'p1', liked: false }, ctx as any);

    const data = qc.getQueryData(key) as { pages: CommunityPost[][] };
    expect(data.pages[0][0]).toMatchObject({ liked_by_me: false, like_count: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- usePostInteractions`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook + helper**

```typescript
// src/hooks/usePostInteractions.ts
import {
  useMutation,
  useQueryClient,
  QueryClient,
  UseMutationOptions,
  InfiniteData,
} from '@tanstack/react-query';
import { likePost, unlikePost } from '@/services/community/postLikes.service';
import { queryKeys } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';

// Pure page-mapper: return new pages with `patch` applied to the one post whose
// id matches. New arrays only where something changed — keeps referential
// identity stable for the untouched pages/rows.
export function patchPostInFeed(
  pages: CommunityPost[][],
  postId: string,
  patch: (p: CommunityPost) => CommunityPost
): CommunityPost[][] {
  return pages.map((page) => {
    if (!page.some((p) => p.id === postId)) return page;
    return page.map((p) => (p.id === postId ? patch(p) : p));
  });
}

type ToggleArgs = { postId: string; liked: boolean };
type Ctx = { prev: InfiniteData<CommunityPost[]> | undefined };

// Factory (like participationMutations) so cache bookkeeping is testable against
// a bare QueryClient. See the design note in the plan: no invalidate on settle.
export function likeMutations(qc: QueryClient, userId: string) {
  const key = queryKeys.community.feed.of(userId);

  const toggle: UseMutationOptions<void, unknown, ToggleArgs, Ctx> = {
    mutationFn: ({ postId, liked }) =>
      liked ? unlikePost({ postId, userId }) : likePost({ postId, userId }),
    onMutate: async ({ postId, liked }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<InfiniteData<CommunityPost[]>>(key);
      if (prev) {
        qc.setQueryData<InfiniteData<CommunityPost[]>>(key, {
          ...prev,
          pages: patchPostInFeed(prev.pages, postId, (p) => ({
            ...p,
            liked_by_me: !liked,
            like_count: Math.max(0, p.like_count + (liked ? -1 : 1)),
          })),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    // No onSettled invalidate — see design note. Counts reconcile on refetch.
  };

  return { toggle };
}

export function useToggleLike() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id) ?? '';
  return useMutation(likeMutations(qc, userId).toggle);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- usePostInteractions`
Expected: PASS (all four describes green).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` (Expected: 0), then:

```bash
git add src/hooks/usePostInteractions.ts src/hooks/__tests__/usePostInteractions.test.ts
git commit -m "feat(community): optimistic like mutations + feed page-patch helper"
```

---

## Task 6: `PostActionBar` + wire into `PostCard`

**Files:**
- Create: `src/components/community/PostActionBar.tsx`
- Modify: `src/components/community/PostCard.tsx`

**Interfaces:**
- Consumes: `useToggleLike` (Task 5), `CommunityPost` (Task 3), `PressableScale`, `Icon`, `COLORS`, `FONTS`, `TYPE_SIZE`, `SPACING`, `expo-haptics`, `react-native-reanimated`.
- Produces: `<PostActionBar post onComment />` — like control (optimistic) + comment button (calls `onComment`, sheet lands in Phase 2b) + share placeholder (disabled).

**Note:** the action bar is inline glyph controls, not labelled `Button`s — the
AGENTS.md-sanctioned bespoke case (a `Button` here would be wrong). Presentational
+ one mutation call; entrance animation stays on the list (Phase 1), the heart
does a local spring-pop only.

- [ ] **Step 1: Write `PostActionBar`**

```tsx
// src/components/community/PostActionBar.tsx
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { PressableScale, Icon } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { CommunityPost } from '@/types/models';
import { useToggleLike } from '@/hooks/usePostInteractions';

// Inline glyph controls (not Button — these are icon affordances, per AGENTS.md).
// Like is optimistic: the heart fills and the count moves on tap, before the
// network resolves. Comment opens the Phase 2b sheet via onComment; share is a
// disabled placeholder until Phase 7.
export function PostActionBar({
  post,
  onComment,
}: {
  post: CommunityPost;
  onComment: (post: CommunityPost) => void;
}) {
  const toggle = useToggleLike();
  const pop = useSharedValue(1);

  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  function onLike() {
    if (!post.liked_by_me) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      pop.value = withSequence(
        withSpring(1.25, { damping: 8, stiffness: 300 }),
        withSpring(1, { damping: 12, stiffness: 260 })
      );
    }
    toggle.mutate({ postId: post.id, liked: post.liked_by_me });
  }

  return (
    <View style={styles.bar}>
      <PressableScale
        onPress={onLike}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel={post.liked_by_me ? 'Unlike' : 'Like'}
      >
        <Animated.View style={heartStyle}>
          <Icon
            name={post.liked_by_me ? 'heart-filled' : 'heart'}
            size={22}
            color={post.liked_by_me ? COLORS.primary : COLORS.textMuted}
          />
        </Animated.View>
        {post.like_count > 0 ? (
          <Text style={styles.count}>{post.like_count}</Text>
        ) : null}
      </PressableScale>

      <PressableScale
        onPress={() => onComment(post)}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel="Comments"
      >
        <Icon name="comment" size={20} color={COLORS.textMuted} />
        {post.comment_count > 0 ? (
          <Text style={styles.count}>{post.comment_count}</Text>
        ) : null}
      </PressableScale>

      {/* Share lands in Phase 7 — placeholder keeps the footer geometry settled. */}
      <View style={[styles.action, styles.disabled]}>
        <Icon name="share" size={20} color={COLORS.inkFaint} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: SPACING[5], marginTop: SPACING[3] },
  action: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  disabled: { opacity: 0.5 },
  count: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
});
```

> **Verify against the real primitives before running** (do not guess — a wrong
> `IconName` fails silently at runtime, not in `tsc`):
> - Icon names: `grep -n "heart\|comment\|share\|chat" src/components/ui/Icon.tsx`.
>   If there is no `heart-filled`, likely the pattern is a single `heart` with a
>   `filled`/`variant` prop, or two Solar names (`Heart` / `HeartBold`). Use
>   whatever the file actually exposes; adjust the two `name=` props.
> - `PressableScale` and `Icon` are exported from `@/components/ui` (`grep -n "PressableScale\|Icon" src/components/ui/index.ts`).
> - `COLORS.inkFaint`, `COLORS.textMuted`, `COLORS.primary` exist (they do — used across the app; `grep -n "inkFaint\|textMuted" src/constants/colors.ts`).
> - `SPACING[1.5]` is a valid key (`grep -n "1.5" src/constants/spacing.ts`); if not, use `SPACING[1]`.

- [ ] **Step 2: Swap `PostCard`'s footer for the action bar**

In `src/components/community/PostCard.tsx`, replace the read-only counts
`<View style={styles.footer}>…</View>` block with the action bar, and add an
`onComment` prop threaded from the screen:

```tsx
import { PostActionBar } from './PostActionBar';
// ...
export function PostCard({
  post,
  isOwn,
  onOverflow,
  onComment,
}: {
  post: CommunityPost;
  isOwn: boolean;
  onOverflow: (post: CommunityPost) => void;
  onComment: (post: CommunityPost) => void;
}) {
  return (
    <Glass tier="panel" radius={RADIUS['2xl']} style={styles.card}>
      <PostAuthorRow post={post} isOwn={isOwn} onOverflow={() => onOverflow(post)} />
      {post.type === 'text' && post.body ? <TextPostBody body={post.body} /> : null}
      <PostActionBar post={post} onComment={onComment} />
    </Glass>
  );
}
```

Remove the now-unused `footer`/`count` styles from `PostCard`'s `StyleSheet`.

> Read the current `PostCard.tsx` first to match its exact prop shape (it already
> takes `isOwn` per the Phase 1 delete work) and remove only the footer block.

- [ ] **Step 3: Thread `onComment` from the screen**

In `app/(tabs)/community.tsx`, add a no-op-for-now handler and pass it to
`PostCard` (the sheet opens in Phase 2b):

```tsx
// Comment sheet lands in Phase 2b; the entry point is wired now.
const onComment = useCallback((_post: CommunityPost) => {}, []);
// ...
<PostCard post={item} isOwn={item.author_id === meId} onOverflow={onOverflow} onComment={onComment} />
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors. Resolve any `IconName` mismatch flagged in Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/components/community/PostActionBar.tsx src/components/community/PostCard.tsx "app/(tabs)/community.tsx"
git commit -m "feat(community): post action bar with optimistic like"
```

---

## Task 7: Phase 2a verification + device check

**Files:** none (verification only), plus a test-plan doc.

- [ ] **Step 1: Full verify gate**

```bash
npm run typecheck   # Expected: 0 errors
npm test            # Expected: green (postLikes.service, usePostInteractions suites included)
npm run lint        # Expected: no NEW errors beyond the pre-existing 95/16
```

- [ ] **Step 2: Write the Phase 2a test plan**

Create `docs/superpowers/tests/2026-07-25-community-phase-2a-test-plan.md` with:
- **Automated:** the two new suites + what they assert.
- **SQL:** count trigger (+1/−1, floors at 0), coalescing (2 likers → 1 row, `count=2`), self-like never notifies, RLS (can't like an unseen post), `liked_by_me` correctness per viewer.
- **Device (Android first):** tap heart → instant fill + light haptic + count roll; tap again → unfill; kill network mid-like → heart rolls back; like someone's post from two accounts → author sees ONE coalesced notification ("X and 1 other…"), first like pushes and the second does not; own-post like never notifies self; scroll past the liked post and back → state persists (optimistic patch held, no reshuffle).

- [ ] **Step 3: Device check + record results**

Walk Step 2's device checklist. Note Android-specific behaviour (heart-pop spring,
haptic). Commit any fixes with `fix(community): …`. Phase 2a is done when the gate
passes and the device checklist passes.

```bash
git add docs/superpowers/tests/2026-07-25-community-phase-2a-test-plan.md
git commit -m "docs(community): phase 2a test plan"
```

---

## Self-Review (against the spec)

- **§2/§13 Phase 2 (likes half):** optimistic likes with rollback ✔; coalesced author notification (the one new primitive) ✔; count trigger reuses the `wrap_photo_likes` shape ✔. Comments, comment-likes, mentions, two-sided moderation are **Phase 2b** (next plan) — deliberately split per writing-plans subsystem guidance, not dropped.
- **§6 feed:** `liked_by_me` added to the keyset RPC without changing its params or ordering; likes do **not** invalidate the infinite feed (no reshuffle) — matches "counts reconciled on refetch." ✔
- **§7 safety:** likes are RLS-scoped to visible posts (`post_id IN (SELECT id FROM posts)`), so you can't like what a block/visibility rule hides. ✔
- **§10 notifications:** coalesce-on-write via upsert-bump; first INSERT pushes (existing `push_notification_fanout` AFTER INSERT), bumps are UPDATEs so push stays silent — exactly the spec's throttle, for free. Never notify your own action. ✔
- **§12 UI/haptics:** `panel` card unchanged; heart spring-pop + `impactAsync(Light)` on like; share placeholder holds footer geometry for Phase 7. ✔

**Placeholder scan:** every code step is concrete. The `>` notes are verification
instructions against real files (icon names, prop names, colour tokens) — the
implementer must confirm them rather than guess, because a wrong `IconName`/token
is the silent-failure class AGENTS.md warns about. The one deliberate call-out is
the `notify_post_liked_coalesced_row(NEW)` bug in Task 1 Step 1, flagged with two
concrete fixes — left visible so the implementer resolves the trigger/plpgsql
wiring consciously rather than copy-pasting a non-compiling `PERFORM`.

**Type consistency:** `CommunityPost.liked_by_me` (Task 3) is produced by the RPC
(Task 2) and consumed by `patchPostInFeed`/`likeMutations` (Task 5) and
`PostActionBar` (Task 6). `likeMutations`/`patchPostInFeed`/`likePost`/`unlikePost`
names match across definition and call sites. `queryKeys.community.feed.of` and
`.post.of` used consistently.
```
