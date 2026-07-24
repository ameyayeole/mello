# Community Phase 1 — Feed Spine + Text Posts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the thinnest end-to-end slice of the Community feed — a user can write a text post (Public or Friends) and see an endless, ranked-by-recency feed of text posts from their city + friends + a global-public backfill, on glass cards, with the Explore tab renamed to Community.

**Architecture:** A new `posts` table + RLS + a keyset-paginated `community_feed` RPC on Supabase; a `posts.service` + `useCommunityFeed` infinite-query hook mirroring the existing `useExploreFeed`/`getExploreFeed` pattern; a renamed `community.tsx` tab route rendering a `FlatList` of `PostCard`s (text-only in this phase) with a top-right compose button opening a text composer `Sheet`. No likes/comments/photos/polls yet — those are Phases 2–7.

**Tech Stack:** Expo Router, React Native, Reanimated 4, TanStack Query v5, Zustand, Supabase (Postgres + RLS + RPC), `expo-haptics`.

## Global Constraints

- **Expo SDK 56** — read the versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing platform code.
- **No hardcoded colours** — use `COLORS` from `@/constants/colors`. **No hardcoded font families** — use `FONTS`. **New UI type uses `TYPE`/`TYPE_SIZE`** steps, never one-off sizes.
- **Check `src/components/ui/` first.** Reuse `Screen`, `ScreenHeader`, `IconButton`, `Button`, `TextField`, `Sheet`, `EmptyState`, `Loader`, `Avatar`, `Glass`, `PressableScale`, `useTabBarInset`. Add a prop before forking; only go bespoke with a comment saying why.
- **Buttons: exactly three variants** (`primary` coral / `secondary` black / `tertiary` white). No pill buttons.
- **Shared query keys live in `src/constants/queryKeys.ts`** with an `all` + `of()` pair. Any feed showing other people's content **must** be in `DISCOVERY_FEED_KEYS`.
- **Verify gates:** `npm run typecheck` must stay at **0**; `npm test` must stay **green**; `npm run lint` — do not add to the pre-existing 95 errors / 16 warnings.
- **Testing reality:** Reanimated 4 throws under Jest, so **no component/render tests**. Test logic by extraction (pure functions, mutation-option factories) and services via the Supabase fluent-builder mock (`src/services/__tests__/friends.service.test.ts` is the reference). **SQL migrations are verified manually in the Supabase SQL editor** with seeded rows — steps below give the exact SQL. Anything visual gets a **device check (Android first** — `SafeAreaView` is a no-op there).
- **DB conventions:** one numbered SQL file per migration, run whole in the SQL editor, `CREATE ... IF NOT EXISTS`, RLS enabled with the table, `snake_case` columns, `p_`-prefixed RPC params. The next free migration number is the highest existing under `supabase/migrations/` **+ 1** — check with `ls supabase/migrations/` before creating the file; this plan writes it as `NNN`.

---

## File Structure

**Created:**
- `supabase/migrations/NNN_community_posts.sql` — `posts` table, RLS, indexes.
- `supabase/migrations/NNN+1_community_feed.sql` — `community_feed` keyset RPC.
- `src/services/community/posts.service.ts` — `getCommunityFeed`, `createTextPost`, `deletePost`.
- `src/services/community/__tests__/posts.service.test.ts` — service tests.
- `src/hooks/useCommunityFeed.ts` — infinite feed hook + `nextCommunityCursor` pure helper.
- `src/hooks/usePostMutations.ts` — `postMutations()` factory (create/delete) + hooks.
- `src/hooks/__tests__/usePostMutations.test.ts` — mutation cache-bookkeeping tests.
- `src/hooks/__tests__/useCommunityFeed.test.ts` — `nextCommunityCursor` tests.
- `src/components/community/PostCard.tsx` — one feed post (switches on type; text only this phase).
- `src/components/community/PostAuthorRow.tsx` — avatar + name + city + timestamp + overflow.
- `src/components/community/TextPostBody.tsx` — the text-post body.
- `src/components/community/ComposePostSheet.tsx` — text composer (`Sheet`).
- `src/components/community/CommunityNudgeCard.tsx` — cold-start nudge.

**Modified:**
- `app/(tabs)/explore.tsx` → **renamed** to `app/(tabs)/community.tsx` — the new screen.
- `app/(tabs)/_layout.tsx` — `TAB_ROUTES` and the `Tabs.Screen`/icon wiring (`explore` → `community`).
- `src/components/ui/Icon.tsx` — add a `community` tab glyph (or remap `explore`).
- `src/types/models.ts` — `PostType`, `PostVisibility`, `CommunityPost`.
- `src/constants/queryKeys.ts` — `community` key family + add feed key to `DISCOVERY_FEED_KEYS`.
- `app/+native-intent.ts` — add `mello://post/<id>` stash (deep-link groundwork; full share is Phase 7).

---

## Task 1: `posts` table + RLS + indexes

**Files:**
- Create: `supabase/migrations/NNN_community_posts.sql`

**Interfaces:**
- Produces: table `posts(id, author_id, type, visibility, body, media, ref_wrap_event_id, city, like_count, comment_count, score, hot_since, hidden, hidden_reason, created_at)`; enums `post_type`, `post_visibility`. Consumed by Tasks 2 and 4.

- [ ] **Step 1: Write the migration file**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- COMMUNITY POSTS: the generic post entity behind the Community feed.
-- Phase 1 uses only type='text'; the other columns (media, ref_wrap_event_id,
-- poll data, moderation) are laid down now so later phases add behaviour, not
-- schema churn. Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE post_type AS ENUM ('text', 'photo', 'poll', 'shared_wrap');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE post_visibility AS ENUM ('public', 'friends');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS posts (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type               post_type       NOT NULL DEFAULT 'text',
  visibility         post_visibility NOT NULL DEFAULT 'friends',
  body               TEXT,
  media              TEXT[]          NOT NULL DEFAULT '{}',
  ref_wrap_event_id  UUID REFERENCES events(id) ON DELETE SET NULL,
  -- Author's city at post time; feed scoping reads this, not live location.
  city               TEXT,
  like_count         INT  NOT NULL DEFAULT 0,
  comment_count      INT  NOT NULL DEFAULT 0,
  -- Ranking columns. Phase 1 orders by created_at; Phase 6 materialises score.
  score              FLOAT NOT NULL DEFAULT 0,
  hot_since          TIMESTAMPTZ,
  -- Moderation auto-hide (Phase 6 trigger flips these; Phase 1 just respects).
  hidden             BOOLEAN NOT NULL DEFAULT FALSE,
  hidden_reason      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A text post must actually carry text.
  CONSTRAINT posts_text_has_body
    CHECK (type <> 'text' OR (body IS NOT NULL AND length(btrim(body)) > 0))
);

-- Keyset pagination reads newest-first; the feed filters out hidden rows.
CREATE INDEX IF NOT EXISTS posts_feed_idx
  ON posts (created_at DESC, id DESC) WHERE hidden = FALSE;
CREATE INDEX IF NOT EXISTS posts_author_idx ON posts (author_id);
CREATE INDEX IF NOT EXISTS posts_city_idx   ON posts (city);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- SELECT: a post is visible if it isn't hidden, neither party has blocked the
-- other, AND (it's public, OR it's yours, OR it's friends-only and you're an
-- accepted friend of the author).
DROP POLICY IF EXISTS "posts_select" ON posts;
CREATE POLICY "posts_select" ON posts
  FOR SELECT TO authenticated
  USING (
    hidden = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = posts.author_id)
         OR (b.blocker_id = posts.author_id AND b.blocked_id = auth.uid())
    )
    AND (
      posts.author_id = auth.uid()
      OR posts.visibility = 'public'
      OR EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = 'accepted'
          AND ((f.requester_id = auth.uid() AND f.addressee_id = posts.author_id)
            OR (f.addressee_id = auth.uid() AND f.requester_id = posts.author_id))
      )
    )
  );

-- INSERT: you may only author your own posts.
DROP POLICY IF EXISTS "posts_insert" ON posts;
CREATE POLICY "posts_insert" ON posts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- DELETE: only the author (Phase 1). Post-author comment moderation is Phase 2.
DROP POLICY IF EXISTS "posts_delete" ON posts;
CREATE POLICY "posts_delete" ON posts
  FOR DELETE TO authenticated
  USING (auth.uid() = author_id);
```

- [ ] **Step 2: Apply and verify the schema**

Run the whole file in the Supabase SQL editor. Then verify:

```sql
-- Expect one row, columns as declared.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'posts' ORDER BY ordinal_position;
-- Expect rowsecurity = true.
SELECT relrowsecurity FROM pg_class WHERE relname = 'posts';
```

Expected: all columns present; `relrowsecurity` = `true`.

- [ ] **Step 3: Verify RLS visibility with seeded rows**

As two real auth users (A and B, not friends), insert via the SQL editor with `SET LOCAL ROLE` or from the app once Task 4 lands. Minimal SQL sanity (run as service role to seed, then as each user to read):

```sql
-- Seed (service role): A public + A friends-only.
INSERT INTO posts (author_id, type, visibility, body, city)
VALUES ('<A>', 'text', 'public',  'A public',  'Mumbai'),
       ('<A>', 'text', 'friends', 'A friends', 'Mumbai');
```

Expected: as B (not a friend of A), `SELECT count(*) FROM posts WHERE author_id='<A>'` returns **1** (public only); as A it returns **2**. If B sees 2, the friends-only branch is broken — fix before moving on.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/NNN_community_posts.sql
git commit -m "feat(community): posts table, RLS and indexes"
```

---

## Task 2: `community_feed` keyset RPC (fallback ladder)

**Files:**
- Create: `supabase/migrations/NNN+1_community_feed.sql`

**Interfaces:**
- Consumes: `posts` (Task 1), `profiles`, `friendships`.
- Produces: `community_feed(p_user_id UUID, p_cursor_created_at TIMESTAMPTZ, p_cursor_id UUID, p_limit INT)` returning `(id, author_id, author_name, author_photo_url, type, visibility, body, media, city, like_count, comment_count, created_at)` ordered newest-first. Consumed by Task 4.

**Note on Phase 1 ranking:** ordering is **reverse-chronological** (`created_at DESC, id DESC`) — an immutable key, so keyset pages never reshuffle. The `score` column exists but is not used for ordering until Phase 6's hybrid score. The "fallback ladder" is expressed as the **visible set**: friends' posts ∪ your-city public ∪ all-public backfill — RLS already guarantees you can only read what you're allowed to, so the set is never empty as long as any public post exists.

- [ ] **Step 1: Write the migration file**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- COMMUNITY FEED: reverse-chronological, keyset-paginated feed of visible posts.
-- Visibility, blocks and friends are enforced by posts' RLS (SECURITY INVOKER),
-- so this function only scopes and paginates. Phase 6 swaps the ORDER BY for a
-- materialised hybrid score; the keyset shape stays. Run whole in SQL editor.
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
  created_at        TIMESTAMPTZ
)
-- SECURITY INVOKER (the default): posts' RLS runs as the calling user, so the
-- visibility/block/friends rules from Task 1 apply without re-implementing them.
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id, p.author_id, pr.name, pr.photo_url, p.type, p.visibility,
    p.body, p.media, p.city, p.like_count, p.comment_count, p.created_at
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  WHERE
    -- Keyset: strictly older than the cursor. NULL cursor = first page.
    (
      p_cursor_created_at IS NULL
      OR (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT p_limit;
$$;
```

- [ ] **Step 2: Apply and verify ordering + keyset**

Run the file. Seed ~5 public posts (as in Task 1). Then:

```sql
-- Page 1 (limit 2). Note the last row's created_at + id.
SELECT id, created_at FROM community_feed('<A>', NULL, NULL, 2);
-- Page 2: pass page-1's last row as the cursor. Expect the NEXT-older 2 rows,
-- with NO overlap and NO gap vs page 1.
SELECT id, created_at FROM community_feed('<A>', '<p1_last_created_at>', '<p1_last_id>', 2);
```

Expected: page 2 rows are strictly older than page 1's last row; no id appears in both pages. If a row repeats, the keyset comparator is wrong — fix before moving on.

- [ ] **Step 3: Verify block scrubbing through the RPC**

```sql
-- As user B, block A, then call the feed. Expect zero A-authored rows.
INSERT INTO blocks (blocker_id, blocked_id) VALUES ('<B>', '<A>');
SELECT count(*) FROM community_feed('<B>', NULL, NULL, 50) WHERE author_id = '<A>';
```

Expected: **0**. (RLS on `posts` does the scrubbing; this proves the RPC honours it.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/NNN+1_community_feed.sql
git commit -m "feat(community): community_feed keyset RPC"
```

---

## Task 3: Types + query keys + `DISCOVERY_FEED_KEYS`

**Files:**
- Modify: `src/types/models.ts`
- Modify: `src/constants/queryKeys.ts`

**Interfaces:**
- Produces: `PostType`, `PostVisibility`, `CommunityPost` (types); `queryKeys.community.feed` (key family). Consumed by Tasks 4, 5, 8.

- [ ] **Step 1: Add the post types to `models.ts`**

Add near the other domain types (e.g. after the `ExploreWrap`/`PublicWrapPhoto` block):

```typescript
// ── Community feed (posts) ───────────────────────────────────────────────────

export type PostType = 'text' | 'photo' | 'poll' | 'shared_wrap';
export type PostVisibility = 'public' | 'friends';

// One post as returned by the community_feed() RPC (author fields flattened).
export interface CommunityPost {
  id: string;
  author_id: string;
  author_name: string;
  author_photo_url: string | null;
  type: PostType;
  visibility: PostVisibility;
  body: string | null;
  media: string[];
  city: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
}
```

- [ ] **Step 2: Add the query-key family**

In `src/constants/queryKeys.ts`, add inside the `queryKeys` object (before the closing `} as const;`):

```typescript
  // Community feed. Scoped per viewer; ordering is keyset-paginated so the key
  // itself carries no cursor (the cursor is the pageParam).
  community: {
    all: ['community'] as const,
    feed: {
      all: ['community', 'feed'] as const,
      of: (userId: Id) => ['community', 'feed', userId] as const,
    },
  },
```

- [ ] **Step 3: Add the feed to `DISCOVERY_FEED_KEYS`**

```typescript
export const DISCOVERY_FEED_KEYS = [
  queryKeys.events.nearby,
  queryKeys.exploreFeed.all,
  queryKeys.dashboardNearby.all,
  queryKeys.swipeDeck.all,
  queryKeys.community.feed.all,
] as const;
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/models.ts src/constants/queryKeys.ts
git commit -m "feat(community): post types + community feed query keys"
```

---

## Task 4: `posts.service` (feed read + create + delete)

**Files:**
- Create: `src/services/community/posts.service.ts`
- Test: `src/services/community/__tests__/posts.service.test.ts`

**Interfaces:**
- Consumes: `community_feed` RPC (Task 2), `posts` table (Task 1), `CommunityPost`/`PostVisibility` (Task 3).
- Produces:
  - `getCommunityFeed(params: { userId: string; cursor?: FeedCursor | null; limit?: number }): Promise<CommunityPost[]>`
  - `createTextPost(params: { authorId: string; body: string; visibility: PostVisibility; city: string | null }): Promise<string>`
  - `deletePost(postId: string): Promise<void>`
  - `export type FeedCursor = { createdAt: string; id: string };`
  Consumed by Task 5.

- [ ] **Step 1: Write the failing service test**

```typescript
// src/services/community/__tests__/posts.service.test.ts
import { getCommunityFeed, createTextPost } from '../posts.service';
import { supabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

describe('getCommunityFeed', () => {
  it('passes null cursor params on the first page', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getCommunityFeed({ userId: 'u1', cursor: null, limit: 10 });
    expect(supabase.rpc).toHaveBeenCalledWith('community_feed', {
      p_user_id: 'u1',
      p_cursor_created_at: null,
      p_cursor_id: null,
      p_limit: 10,
    });
  });

  it('forwards the cursor on later pages', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getCommunityFeed({
      userId: 'u1',
      cursor: { createdAt: '2026-07-25T00:00:00Z', id: 'p9' },
      limit: 10,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('community_feed', {
      p_user_id: 'u1',
      p_cursor_created_at: '2026-07-25T00:00:00Z',
      p_cursor_id: 'p9',
      p_limit: 10,
    });
  });

  it('throws on rpc error', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    await expect(
      getCommunityFeed({ userId: 'u1', cursor: null })
    ).rejects.toBeTruthy();
  });
});

describe('createTextPost', () => {
  it('inserts the trimmed body with author, visibility and city', async () => {
    const single = jest
      .fn()
      .mockResolvedValue({ data: { id: 'new1' }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    const id = await createTextPost({
      authorId: 'u1',
      body: '  hi  ',
      visibility: 'public',
      city: 'Mumbai',
    });

    expect(supabase.from).toHaveBeenCalledWith('posts');
    expect(insert).toHaveBeenCalledWith({
      author_id: 'u1',
      type: 'text',
      body: 'hi',
      visibility: 'public',
      city: 'Mumbai',
    });
    expect(id).toBe('new1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- posts.service`
Expected: FAIL — "Cannot find module '../posts.service'".

- [ ] **Step 3: Write the service**

```typescript
// src/services/community/posts.service.ts
import { supabase } from '@/services/supabase';
import { CommunityPost, PostVisibility } from '@/types/models';

// The keyset cursor: the last row of the page you just read. Passing it back
// asks community_feed() for rows strictly older than this (created_at, id).
export type FeedCursor = { createdAt: string; id: string };

export async function getCommunityFeed(params: {
  userId: string;
  cursor?: FeedCursor | null;
  limit?: number;
}): Promise<CommunityPost[]> {
  const { data, error } = await supabase.rpc('community_feed', {
    p_user_id: params.userId,
    p_cursor_created_at: params.cursor?.createdAt ?? null,
    p_cursor_id: params.cursor?.id ?? null,
    p_limit: params.limit ?? 10,
  });
  if (error) throw error;
  return (data ?? []) as CommunityPost[];
}

export async function createTextPost(params: {
  authorId: string;
  body: string;
  visibility: PostVisibility;
  city: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: params.authorId,
      type: 'text',
      body: params.body.trim(),
      visibility: params.visibility,
      city: params.city,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- posts.service`
Expected: PASS (all three describes green).

- [ ] **Step 5: Commit**

```bash
git add src/services/community/posts.service.ts src/services/community/__tests__/posts.service.test.ts
git commit -m "feat(community): posts service (feed, create, delete)"
```

---

## Task 5: Feed hook + cursor helper + post mutations

**Files:**
- Create: `src/hooks/useCommunityFeed.ts`
- Create: `src/hooks/usePostMutations.ts`
- Test: `src/hooks/__tests__/useCommunityFeed.test.ts`
- Test: `src/hooks/__tests__/usePostMutations.test.ts`

**Interfaces:**
- Consumes: `getCommunityFeed`/`createTextPost`/`deletePost`/`FeedCursor` (Task 4), `queryKeys.community` + `DISCOVERY_FEED_KEYS` (Task 3), `useAuthStore`, `useLocationStore`.
- Produces:
  - `nextCommunityCursor(lastPage: CommunityPost[], pageSize: number): FeedCursor | undefined`
  - `useCommunityFeed()` — infinite query
  - `postMutations(qc, user)` factory returning `{ create, remove }` `UseMutationOptions`
  - `useCreatePost()`, `useDeletePost()`
  Consumed by Tasks 7 and 8.

- [ ] **Step 1: Write the failing cursor-helper test**

```typescript
// src/hooks/__tests__/useCommunityFeed.test.ts
import { nextCommunityCursor } from '../useCommunityFeed';
import { CommunityPost } from '@/types/models';

const post = (id: string, createdAt: string): CommunityPost => ({
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
  created_at: createdAt,
});

describe('nextCommunityCursor', () => {
  it('returns undefined when the page is short (no more rows)', () => {
    expect(nextCommunityCursor([post('1', 't1')], 10)).toBeUndefined();
  });

  it('returns the last row as the cursor when the page is full', () => {
    const page = [post('1', 't1'), post('2', 't2')];
    expect(nextCommunityCursor(page, 2)).toEqual({ createdAt: 't2', id: '2' });
  });

  it('returns undefined for an empty page', () => {
    expect(nextCommunityCursor([], 10)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- useCommunityFeed`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the feed hook + helper**

```typescript
// src/hooks/useCommunityFeed.ts
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getCommunityFeed, FeedCursor } from '@/services/community/posts.service';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';

const PAGE_SIZE = 10;

// The next keyset cursor: the last row of a full page. A short page means we've
// reached the end, so there's no next cursor and paging stops.
export function nextCommunityCursor(
  lastPage: CommunityPost[],
  pageSize: number
): FeedCursor | undefined {
  if (lastPage.length < pageSize) return undefined;
  const last = lastPage[lastPage.length - 1];
  return { createdAt: last.created_at, id: last.id };
}

export function useCommunityFeed(enabled = true) {
  const user = useAuthStore((s) => s.user);

  return useInfiniteQuery({
    queryKey: queryKeys.community.feed.of(user?.id),
    queryFn: ({ pageParam }) =>
      getCommunityFeed({
        userId: user!.id,
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: null as FeedCursor | null,
    getNextPageParam: (lastPage) => nextCommunityCursor(lastPage, PAGE_SIZE),
    enabled: !!user && enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
```

- [ ] **Step 4: Run to verify the helper test passes**

Run: `npm test -- useCommunityFeed`
Expected: PASS.

- [ ] **Step 5: Write the failing mutation-factory test**

```typescript
// src/hooks/__tests__/usePostMutations.test.ts
import { QueryClient } from '@tanstack/react-query';
import { postMutations } from '../usePostMutations';
import { queryKeys } from '@/constants/queryKeys';
import * as svc from '@/services/community/posts.service';
import { Profile } from '@/types/models';

jest.mock('@/services/community/posts.service');

const user = { id: 'u1', city: 'Mumbai' } as unknown as Profile;

beforeEach(() => jest.clearAllMocks());

describe('postMutations.create', () => {
  it('calls createTextPost with the author, city and payload', async () => {
    (svc.createTextPost as jest.Mock).mockResolvedValue('new1');
    const qc = new QueryClient();
    const { create } = postMutations(qc, user);

    await create.mutationFn!({ body: 'hello', visibility: 'public' } as any);

    expect(svc.createTextPost).toHaveBeenCalledWith({
      authorId: 'u1',
      body: 'hello',
      visibility: 'public',
      city: 'Mumbai',
    });
  });

  it('invalidates the community feed on success', async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { create } = postMutations(qc, user);

    create.onSuccess!('new1', {} as any, undefined as any, {} as any);

    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.community.feed.all });
  });
});

describe('postMutations.remove', () => {
  it('calls deletePost with the id', async () => {
    (svc.deletePost as jest.Mock).mockResolvedValue(undefined);
    const qc = new QueryClient();
    const { remove } = postMutations(qc, user);

    await remove.mutationFn!('p9');

    expect(svc.deletePost).toHaveBeenCalledWith('p9');
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- usePostMutations`
Expected: FAIL — module not found.

- [ ] **Step 7: Write the mutations factory + hooks**

```typescript
// src/hooks/usePostMutations.ts
import {
  useMutation,
  useQueryClient,
  QueryClient,
  UseMutationOptions,
} from '@tanstack/react-query';
import { createTextPost, deletePost } from '@/services/community/posts.service';
import { queryKeys } from '@/constants/queryKeys';
import { PostVisibility, Profile } from '@/types/models';
import { useAuthStore } from '@/stores/authStore';

export type CreatePostArgs = { body: string; visibility: PostVisibility };

// Built as a factory (like participationMutations) so the cache bookkeeping can
// be tested against a bare QueryClient without a renderer.
export function postMutations(qc: QueryClient, user: Profile | null) {
  const create: UseMutationOptions<string, unknown, CreatePostArgs> = {
    mutationFn: (args) =>
      createTextPost({
        authorId: user!.id,
        body: args.body,
        visibility: args.visibility,
        city: user?.city ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.community.feed.all });
    },
  };

  const remove: UseMutationOptions<void, unknown, string> = {
    mutationFn: (postId) => deletePost(postId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.community.feed.all });
    },
  };

  return { create, remove };
}

export function useCreatePost() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation(postMutations(qc, user).create);
}

export function useDeletePost() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation(postMutations(qc, user).remove);
}
```

- [ ] **Step 8: Run to verify all hook tests pass**

Run: `npm test -- usePostMutations useCommunityFeed`
Expected: PASS.

- [ ] **Step 9: Typecheck + commit**

Run: `npm run typecheck` (Expected: 0 errors), then:

```bash
git add src/hooks/useCommunityFeed.ts src/hooks/usePostMutations.ts src/hooks/__tests__/useCommunityFeed.test.ts src/hooks/__tests__/usePostMutations.test.ts
git commit -m "feat(community): feed hook, cursor helper and post mutations"
```

---

## Task 6: Post-card components (author row, text body, card shell, nudge)

**Files:**
- Create: `src/components/community/PostAuthorRow.tsx`
- Create: `src/components/community/TextPostBody.tsx`
- Create: `src/components/community/PostCard.tsx`
- Create: `src/components/community/CommunityNudgeCard.tsx`

**Interfaces:**
- Consumes: `CommunityPost` (Task 3), `Avatar`, `Glass`, `IconButton`, `PressableScale`, `COLORS`, `FONTS`, `TYPE`/`TYPE_SIZE`, `SPACING`, `RADIUS`.
- Produces: `<PostCard post onDelete />`, `<CommunityNudgeCard onCompose onFindFriends onDismiss />`. Consumed by Task 7.

**Note:** these are presentational (no Reanimated worklets), so entrance animation lives on the list in Task 7. No render tests (Reanimated/Jest); verified on device in Task 7's device check.

- [ ] **Step 1: Write `PostAuthorRow`**

```tsx
// src/components/community/PostAuthorRow.tsx
import { View, Text, StyleSheet } from 'react-native';
import { Avatar, IconButton } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { CommunityPost } from '@/types/models';
import { relativeTime } from '@/utils/relativeTime';

// Avatar + name + city · time, with an overflow button on the right. The
// overflow's menu (delete / report) is wired by the parent card.
export function PostAuthorRow({
  post,
  onOverflow,
}: {
  post: CommunityPost;
  onOverflow: () => void;
}) {
  const meta = [post.city, relativeTime(post.created_at)]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.row}>
      <Avatar name={post.author_name} photoUrl={post.author_photo_url} size={40} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {post.author_name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <IconButton
        icon="more"
        variant="ghost"
        size={32}
        iconSize={18}
        onPress={onOverflow}
        accessibilityLabel="Post options"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  text: { flex: 1 },
  name: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textPrimary,
  },
  meta: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
    marginTop: 1,
  },
});
```

> Before writing this, confirm the exact `IconName` for an overflow glyph (`grep "more\|dots\|ellipsis" src/components/ui/Icon.tsx`) and a `relativeTime` helper (`ls src/utils | grep -i time`); if neither exists, use the nearest existing icon and the timestamp formatter already used by chat/notifications (`grep -rl "ago" src/utils src/components`). Adjust the two imports to the real names — do not invent them.

- [ ] **Step 2: Write `TextPostBody`**

```tsx
// src/components/community/TextPostBody.tsx
import { Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';

export function TextPostBody({ body }: { body: string }) {
  return <Text style={styles.body}>{body}</Text>;
}

const styles = StyleSheet.create({
  body: {
    fontFamily: FONTS.regular,
    fontSize: TYPE_SIZE.body,
    lineHeight: TYPE_SIZE.body * 1.4,
    color: COLORS.textPrimary,
    marginTop: SPACING[3],
  },
});
```

- [ ] **Step 3: Write `PostCard` (text-only this phase)**

```tsx
// src/components/community/PostCard.tsx
import { View, Text, StyleSheet } from 'react-native';
import { Glass } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { RADIUS } from '@/constants/spacing';
import { CommunityPost } from '@/types/models';
import { PostAuthorRow } from './PostAuthorRow';
import { TextPostBody } from './TextPostBody';

// One post in the feed. Phase 1 renders text posts only; photo/poll/shared_wrap
// arrive in Phases 3–5, each as another branch here. The like/comment/share
// action bar is Phase 2 — this phase shows read-only counts so the card's
// footer geometry is settled before interactions land on it.
export function PostCard({
  post,
  onOverflow,
}: {
  post: CommunityPost;
  onOverflow: (post: CommunityPost) => void;
}) {
  return (
    <Glass tier="panel" radius={RADIUS['2xl']} style={styles.card}>
      <PostAuthorRow post={post} onOverflow={() => onOverflow(post)} />
      {post.type === 'text' && post.body ? (
        <TextPostBody body={post.body} />
      ) : null}
      <View style={styles.footer}>
        <Text style={styles.count}>{post.like_count} likes</Text>
        <Text style={styles.count}>{post.comment_count} comments</Text>
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: { padding: SPACING[4], gap: SPACING[1] },
  footer: {
    flexDirection: 'row',
    gap: SPACING[4],
    marginTop: SPACING[3],
  },
  count: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
});
```

> Confirm `<Glass>` accepts a `style` prop and `radius` as a number (`grep -n "style\|radius" src/components/ui/Glass.tsx`); it does per DESIGN.md, but match the real prop names. Confirm `RADIUS` is exported from `@/constants/spacing` (`grep -n "RADIUS" src/constants/spacing.ts`).

- [ ] **Step 4: Write `CommunityNudgeCard`**

```tsx
// src/components/community/CommunityNudgeCard.tsx
import { View, Text, StyleSheet } from 'react-native';
import { Glass, Button, IconButton } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';

// Cold-start nudge for users with few friends / no posts. Dismissible; the
// parent screen decides when it recurs (see Task 7).
export function CommunityNudgeCard({
  onCompose,
  onFindFriends,
  onDismiss,
}: {
  onCompose: () => void;
  onFindFriends: () => void;
  onDismiss: () => void;
}) {
  return (
    <Glass tier="panel" radius={RADIUS['2xl']} style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Get your feed going</Text>
        <IconButton
          icon="close"
          variant="ghost"
          size={28}
          iconSize={16}
          onPress={onDismiss}
          accessibilityLabel="Dismiss"
        />
      </View>
      <Text style={styles.body}>
        Post something or add a few friends — your community fills up fast.
      </Text>
      <View style={styles.actions}>
        <Button variant="secondary" size="sm" label="Post" onPress={onCompose} />
        <Button
          variant="tertiary"
          size="sm"
          label="Find friends"
          onPress={onFindFriends}
        />
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: { padding: SPACING[4], gap: SPACING[3] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.bodyLg, color: COLORS.textPrimary },
  body: { fontFamily: FONTS.regular, fontSize: TYPE_SIZE.body, color: COLORS.textSecondary },
  actions: { flexDirection: 'row', gap: SPACING[2] },
});
```

> Confirm `Button`'s prop is `label` (not `title`) and that `size="sm"` exists (`grep -n "label\|size\|variant" src/components/ui/Button.tsx`) and the `TYPE_SIZE` keys used (`bodyLg`, `body`, `caption`) exist (`grep -n "" src/constants/typography.ts | grep TYPE_SIZE -A20`). Swap to the real names before running.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors. (Fix any prop/name mismatches flagged by the `>` notes above.)

- [ ] **Step 6: Commit**

```bash
git add src/components/community/
git commit -m "feat(community): post card, author row, text body and nudge card"
```

---

## Task 7: The Community screen + tab rename

**Files:**
- Rename: `app/(tabs)/explore.tsx` → `app/(tabs)/community.tsx` (use `git mv`)
- Modify: `app/(tabs)/_layout.tsx`
- Modify: `src/components/ui/Icon.tsx`
- Modify: `app/+native-intent.ts`

**Interfaces:**
- Consumes: `useCommunityFeed` (Task 5), `PostCard`/`CommunityNudgeCard` (Task 6), `Screen`/`Loader`/`EmptyState`/`IconButton`/`useTabBarInset`, `useUIStore`.
- Produces: the `/community` route. The compose button calls a screen-local state that opens Task 8's `ComposePostSheet`.

- [ ] **Step 1: Rename the route file**

Run:
```bash
git mv app/\(tabs\)/explore.tsx app/\(tabs\)/community.tsx
```

- [ ] **Step 2: Rewrite the screen body**

Replace the contents of `app/(tabs)/community.tsx`:

```tsx
import { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { useCommunityFeed } from '@/hooks/useCommunityFeed';
import { CommunityPost } from '@/types/models';
import {
  EmptyState,
  Loader,
  Screen,
  IconButton,
  useTabBarInset,
} from '@/components/ui';
import { PostCard } from '@/components/community/PostCard';
import { CommunityNudgeCard } from '@/components/community/CommunityNudgeCard';
import { ComposePostSheet } from '@/components/community/ComposePostSheet';
import { errorMessage } from '@/utils/errors';

export default function CommunityScreen() {
  const tabBarInset = useTabBarInset();
  const router = useRouter();
  const feed = useCommunityFeed();
  const [composeOpen, setComposeOpen] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const posts = useMemo(
    () => feed.data?.pages.flat() ?? [],
    [feed.data]
  );

  const openCompose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setComposeOpen(true);
  }, []);

  // Nudge shows when the feed is genuinely thin and not dismissed this session.
  const showNudge = !nudgeDismissed && !feed.isLoading && posts.length < 3;

  function onOverflow(_post: CommunityPost) {
    // Delete/report menu — wired to useDeletePost + report in Phase 2's action
    // work. Phase 1 leaves the entry point in place.
  }

  function loadMore() {
    if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
  }

  return (
    <View style={styles.root}>
      <Screen background="transparent">
        <View style={styles.header}>
          <Text style={styles.title}>Community</Text>
          <IconButton
            icon="plus"
            variant="surface"
            onPress={openCompose}
            accessibilityLabel="Create a post"
          />
        </View>

        {feed.isLoading ? (
          <Loader />
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.list, { paddingBottom: tabBarInset }]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              showNudge ? (
                <CommunityNudgeCard
                  onCompose={openCompose}
                  onFindFriends={() => router.push('/friends')}
                  onDismiss={() => setNudgeDismissed(true)}
                />
              ) : null
            }
            renderItem={({ item, index }) => (
              <Animated.View
                entering={FadeInDown.delay(Math.min(index, 6) * 60).duration(350)}
              >
                <PostCard post={item} onOverflow={onOverflow} />
              </Animated.View>
            )}
            refreshControl={
              <RefreshControl
                refreshing={feed.isRefetching && !feed.isFetchingNextPage}
                onRefresh={() => feed.refetch()}
                tintColor={COLORS.primary}
              />
            }
            onEndReachedThreshold={0.5}
            onEndReached={loadMore}
            ListFooterComponent={
              feed.isFetchingNextPage ? (
                <ActivityIndicator
                  color={COLORS.primary}
                  style={{ marginVertical: SPACING[4] }}
                />
              ) : null
            }
            ListEmptyComponent={
              feed.isError ? (
                <EmptyState
                  icon="close"
                  title="Couldn't load Community"
                  body={errorMessage(feed.error)}
                  actionLabel="Retry"
                  onAction={() => feed.refetch()}
                />
              ) : (
                <EmptyState
                  icon="edit"
                  title="Nothing here yet"
                  body="Be the first to post in your city."
                  actionLabel="Post"
                  onAction={openCompose}
                />
              )
            }
          />
        )}
      </Screen>

      <ComposePostSheet
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[2.5],
    paddingBottom: SPACING[2],
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    letterSpacing: -0.44,
    color: COLORS.textPrimary,
  },
  list: { padding: SPACING[4], paddingTop: SPACING[1], gap: SPACING[3] },
});
```

> Confirm the `IconName` for compose (`plus`/`add`/`edit`) and empty-state icons exist (`grep -n "plus\|add\|edit\|close" src/components/ui/Icon.tsx`). Confirm `EmptyState` accepts `actionLabel`/`onAction` (it does — used in the old explore screen) and that `/friends` is the correct route (`ls app/friends`). Swap names to real ones.

- [ ] **Step 3: Rename the tab in `_layout.tsx`**

In `app/(tabs)/_layout.tsx`:
- Change `TAB_ROUTES` entry `'/explore'` → `'/community'`.
- Change the `<Tabs.Screen name="explore" ...>` to `name="community"`, `title: 'Community'`.
- Change its `<TabIcon name="explore" ...>` to `name="community"` (add the glyph in Step 4). Keep the `hovered={pickedUp && dragIndex === 1}` index.

- [ ] **Step 4: Add the `community` tab glyph in `Icon.tsx`**

In `src/components/ui/Icon.tsx`, extend the `'home' | 'explore' | 'map' | 'inbox'` union used by `TAB_SOLAR`/`TabGlyph` to include `'community'`, and add its Solar glyph name (reuse `'Compass'`, or pick `'UsersGroupRounded'` if present):

```typescript
const TAB_SOLAR: Record<'home' | 'community' | 'map' | 'inbox', string> = {
  home: 'Home',            // (keep existing value)
  community: 'UsersGroupRounded',
  map: 'Map',              // (keep existing value)
  inbox: 'ChatRound',      // (keep existing value)
};
```

> Verify the exact existing values before editing (`sed -n '449,475p' src/components/ui/Icon.tsx`) and that `UsersGroupRounded` exists in the Solar set the file imports; if unsure, keep `'Compass'`. Update **every** `name:` union in that file that listed `'explore'` (there are two — the `TAB_SOLAR` key type and the `TabIcon`/`TabGlyph` prop type) so typecheck passes.

- [ ] **Step 5: Add the post deep-link stash in `+native-intent.ts`**

Add before the event match (groundwork for Phase 7; harmless now):

```typescript
    const post = path.match(/(?:^|\/)post\/([^/?#]+)/);
    if (post?.[1]) {
      // Post detail route lands in Phase 7; for now, send to the feed.
      return '/(tabs)/community';
    }
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors. Resolve any lingering `'explore'` union references the rename exposed.

- [ ] **Step 7: Commit**

```bash
git add app/\(tabs\)/community.tsx app/\(tabs\)/_layout.tsx src/components/ui/Icon.tsx app/+native-intent.ts
git commit -m "feat(community): rename Explore tab to Community with the posts feed"
```

---

## Task 8: The text composer sheet

**Files:**
- Create: `src/components/community/ComposePostSheet.tsx`

**Interfaces:**
- Consumes: `Sheet`, `TextField`, `Button`, `SegmentedControl`-or-`Button` toggle, `useCreatePost` (Task 5), `COLORS`/`FONTS`/`TYPE_SIZE`/`SPACING`, `expo-haptics`.
- Produces: `<ComposePostSheet visible onClose />`.

- [ ] **Step 1: Write the composer**

```tsx
// src/components/community/ComposePostSheet.tsx
import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Sheet, Button, TextField, PressableScale } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';
import { useCreatePost } from '@/hooks/usePostMutations';
import { PostVisibility } from '@/types/models';

const MAX = 280;

export function ComposePostSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('friends');
  const create = useCreatePost();

  const trimmed = body.trim();
  const canPost = trimmed.length > 0 && trimmed.length <= MAX && !create.isPending;

  function reset() {
    setBody('');
    setVisibility('friends');
  }

  function submit() {
    if (!canPost) return;
    create.mutate(
      { body: trimmed, visibility },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          reset();
          onClose();
        },
        onError: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      }
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="New post">
      <View style={styles.body}>
        <TextField
          value={body}
          onChangeText={setBody}
          placeholder="What's happening in your city?"
          multiline
          maxLength={MAX}
          counter
          autoFocus
        />

        <View style={styles.visRow}>
          {(['friends', 'public'] as PostVisibility[]).map((v) => {
            const active = visibility === v;
            return (
              <PressableScale
                key={v}
                onPress={() => {
                  Haptics.selectionAsync();
                  setVisibility(v);
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {v === 'friends' ? 'Friends' : 'Public'}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        <Button
          variant="secondary"
          size="lg"
          label={create.isPending ? 'Posting…' : 'Post'}
          onPress={submit}
          disabled={!canPost}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACING[4], paddingBottom: SPACING[2] },
  visRow: { flexDirection: 'row', gap: SPACING[2] },
  chip: {
    paddingVertical: SPACING[2],
    paddingHorizontal: SPACING[4],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.inkSubtle,
  },
  chipActive: { backgroundColor: COLORS.accent },
  chipText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  chipTextActive: { color: COLORS.white },
});
```

> Verify against the real primitives before running: `Sheet`'s props (`visible`/`onClose`/`title` — `grep -n "" src/components/ui/Overlay.tsx | grep -i "visible\|onClose\|title\|children"`); `TextField`'s `multiline`/`counter`/`maxLength` props (`grep -n "multiline\|counter\|maxLength" src/components/ui/TextField.tsx` — if `counter` isn't a prop, show `${trimmed.length}/${MAX}` manually); `RADIUS.full` and `COLORS.inkSubtle`/`COLORS.white` exist (`grep -n "full" src/constants/spacing.ts; grep -n "inkSubtle\|white" src/constants/colors.ts`). Swap any mismatch to the real name — these chips are a local pattern (not a `Button`, which would be wrong here) since they're a segmented toggle; that's why they're bespoke, per AGENTS.md.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/community/ComposePostSheet.tsx
git commit -m "feat(community): text composer sheet with visibility toggle"
```

---

## Task 9: Phase verification + device check

**Files:** none (verification only).

- [ ] **Step 1: Full verify gate**

Run:
```bash
npm run typecheck   # Expected: 0 errors
npm test            # Expected: green (new posts.service, useCommunityFeed, usePostMutations suites included)
npm run lint        # Expected: no NEW errors beyond the pre-existing 95/16
```

- [ ] **Step 2: Device check (Android first, then iOS)**

Walk this checklist on a device (Reanimated/glass/SafeAreaView can't be unit-tested):

1. The tab bar shows **Community** where Explore was; the glyph renders and the travelling indicator still lands on it.
2. Opening the tab shows the feed (or the empty state) over the drifting `AppBackground`; **cards are glass, spacing is roomy, no horizontal scroll.**
3. Tap the **top-right compose** button → medium haptic, sheet opens, autofocus keyboard.
4. Type a post, toggle **Friends/Public** (selection haptic), tap **Post** → success haptic, sheet closes, the post appears at the **top** of the feed after refetch.
5. Post a **Public** and a **Friends** post from account A; from account B (not friends) confirm only the **Public** one appears; friend B sees both.
6. Pull-to-refresh works; scrolling past ~10 posts loads more with **no duplicates and no gaps** (the keyset check).
7. Block A from B (via profile) → A's posts vanish from B's Community feed (proves `DISCOVERY_FEED_KEYS`).
8. The nudge card shows for a near-empty feed and dismisses; the entrance stagger plays on scroll-in.

- [ ] **Step 3: Record results + commit any fixes**

Note anything Android-specific (glass falls back to flat fill — layout/edge/shadow must still read). Commit fixes discovered in the device check with `fix(community): …`. Phase 1 is done when Steps 1–2 pass on a device.

---

## Self-Review (against the spec)

- **§4 architecture / §5 data model:** `posts` table (Task 1) carries `visibility` from row one, plus the future columns (media, ref_wrap, poll via later phases, moderation) — matches "lay it down once." ✔
- **§6 feed:** keyset-on-immutable-`created_at` (Tasks 2, 5) — never offset; fallback ladder via the visible set + RLS; nudge card dismissible this session (recurring-across-sessions persistence is deferred to Phase 6 with the score work — noted, not silently dropped). `score`/`hot_since` columns reserved. ✔
- **§7 safety:** blocks scrubbed via RLS + `DISCOVERY_FEED_KEYS` (Tasks 1, 3); KYC cross-city gate + auto-hide triggers are **Phase 6** by design, not Phase 1. ✔
- **§12 UI:** `panel` glass cards, roomy `SPACING`, `FadeInDown` stagger, haptics on compose/toggle/publish. ✔
- **§13 Phase 1 scope:** posts table, keyset feed RPC + ladder, route rename, top-right compose → text composer, glass cards, empty/nudge states, block scrubbing, query keys — **all covered**. Likes/comments/photos/polls/wraps/share correctly **excluded** (Phases 2–7). ✔
- **Deferred-but-visible:** the `PostCard` overflow entry point and read-only like/comment counts exist so Phase 2 attaches interactions without moving geometry — a deliberate seam, not dead scope.

**Placeholder scan:** every code step is concrete; the `>` notes are *verification instructions against real files*, not placeholders — they exist because this plan can't see the exact prop/icon/token names and the implementer must confirm them rather than guess (guessing a wrong `COLORS`/`IconName` is exactly the silent-failure class AGENTS.md warns about).

**Type consistency:** `FeedCursor` ({createdAt,id}) is produced in Task 4 and consumed unchanged in Task 5; `CommunityPost` shape is identical across Tasks 3/4/5/6; `postMutations`/`nextCommunityCursor`/`getCommunityFeed`/`createTextPost`/`deletePost` names match across their definition and call sites.
```
