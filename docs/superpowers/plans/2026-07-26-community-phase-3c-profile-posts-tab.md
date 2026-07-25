# Community Phase 3c — Profile "Posts" tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A **Posts** section on both the own-profile and other-user profile
screens, with a **Grid | List** toggle: Grid = that user's photo posts only
(3-column, Instagram aesthetic), List = all their post types chronologically as
the existing `PostCard`. Visibility is **viewer-scoped** by the DB, and delete of
your own post runs the same code path as the feed.

**Architecture:** One `user_posts(target, viewer, cursor, limit)` RPC
(`SECURITY INVOKER`, so posts' RLS from migration 044 enforces viewer-scoped
visibility for free — stranger sees public, friend sees public+friends, you see
everything). A `getUserPosts` service + `useUserPosts` infinite-query hook mirror
`getCommunityFeed`/`useCommunityFeed`. A **self-contained** `<ProfilePosts>`
component owns the toggle, the query, the `CommentSheet`, and the delete `Dialog`,
reusing `PostCard` for List — so each profile screen drops in one line and the
intricate animation code in those screens is untouched (spec: "one new tab, not a
profile rewrite"). Grid tiles open a read-only fullscreen photo viewer; List's
`PostCard` overflow gives delete for your own posts — the same `useDeletePost`
path the feed uses.

**Tech Stack:** Supabase plpgsql, TanStack Query v5 (`useInfiniteQuery`),
Reanimated 4, expo-image, expo-haptics.

## Global Constraints
- Never hardcode a colour/font/radius — `COLORS` / `FONTS` / `TYPE_SIZE` / `RADIUS` / `SPACING`.
- No new glass tier. Grid tiles are bare images; the toggle is a bespoke
  segmented control (a single-select group — no `Button` variant fits, same call
  the composer's visibility chips made).
- Query keys go in `src/constants/queryKeys.ts`; a feed that shows **other
  people's** posts MUST be added to `DISCOVERY_FEED_KEYS` or blocking someone
  leaves them on this screen (AGENTS.md — has happened twice).
- Reuse, don't fork: `PostCard`, `CommentSheet`, `useDeletePost`,
  `nextCommunityCursor`, the `getCommunityFeed` cursor shape.
- **No FlatList inside the profile ScrollView.** Both profile screens are one big
  `Animated.ScrollView`; a nested virtualized list breaks scrolling. `ProfilePosts`
  renders loaded pages with `.map` + a "Load more" button.
- `selectionAsync()` haptic on the Grid/List toggle (spec §12).

---

### Task 1: Migration 057 — user_posts RPC

**Files:**
- Create: `supabase/migrations/057_user_posts.sql`

**Interfaces:**
- Produces: `user_posts(p_target_id UUID, p_viewer_id UUID, p_cursor_created_at
  TIMESTAMPTZ, p_cursor_id UUID, p_limit INT)` returning the **same columns** as
  `community_feed` (id, author_id, author_name, author_photo_url, type,
  visibility, body, media, city, like_count, comment_count, created_at,
  liked_by_me, comments_enabled) — so the client maps rows to `CommunityPost`
  identically.

Design notes:
- `SECURITY INVOKER` (the default): posts' RLS runs as the caller, so the
  viewer-scoped visibility rule (public / friends-if-accepted / all-if-self) plus
  the block check apply without re-implementing them here. This function only
  scopes to one author and paginates.
- Keyset shape is identical to `community_feed` (newest-first, `(created_at, id)`
  cursor).
- `p_viewer_id` is currently only used for `liked_by_me`; author scoping is via
  `p_target_id`. Kept in the signature for symmetry with `community_feed`.
- Header must NOT start a line with the `COMMENT` keyword (editor splitter). Run
  whole file.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- USER POSTS: one author's posts for the Profile "Posts" tab, newest-first,
-- keyset-paginated. SECURITY INVOKER, so posts' RLS (migration 044) enforces
-- viewer-scoped visibility (stranger→public, friend→public+friends, self→all)
-- and the block check — this function only scopes to p_target_id and paginates.
-- Same RETURNS shape as community_feed so the client reuses CommunityPost.
-- Run this whole file in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS user_posts(UUID, UUID, TIMESTAMPTZ, UUID, INT);
CREATE OR REPLACE FUNCTION user_posts(
  p_target_id         UUID,
  p_viewer_id         UUID,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id         UUID        DEFAULT NULL,
  p_limit             INT         DEFAULT 12
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
  comments_enabled  BOOLEAN
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id, p.author_id, pr.name, pr.photo_url, p.type, p.visibility,
    p.body, p.media, p.city, p.like_count, p.comment_count, p.created_at,
    EXISTS (
      SELECT 1 FROM post_likes pl
      WHERE pl.post_id = p.id AND pl.user_id = p_viewer_id
    ) AS liked_by_me,
    p.comments_enabled
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  WHERE p.author_id = p_target_id
    AND (
      p_cursor_created_at IS NULL
      OR (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT p_limit;
$$;
```

- [ ] **Step 2: Commit** (`feat(community): user_posts RPC for profile tab (057)`)

---

### Task 2: Service + query key + hook

**Files:**
- Modify: `src/services/community/posts.service.ts` (`getUserPosts`)
- Modify: `src/constants/queryKeys.ts` (`community.userPosts` + `DISCOVERY_FEED_KEYS`)
- Create: `src/hooks/useUserPosts.ts`

**Interfaces:**
- Consumes: `FeedCursor`, `nextCommunityCursor`.
- Produces: `getUserPosts({ targetId, viewerId, cursor, limit }) => Promise<CommunityPost[]>`;
  `queryKeys.community.userPosts.of(userId)` + `.all`; `useUserPosts(userId)`
  (infinite query).

- [ ] **Step 1: Service.** Add to `posts.service.ts` below `getCommunityFeed`:

```ts
export async function getUserPosts(params: {
  targetId: string;
  viewerId: string;
  cursor?: FeedCursor | null;
  limit?: number;
}): Promise<CommunityPost[]> {
  const { data, error } = await supabase.rpc('user_posts', {
    p_target_id: params.targetId,
    p_viewer_id: params.viewerId,
    p_cursor_created_at: params.cursor?.createdAt ?? null,
    p_cursor_id: params.cursor?.id ?? null,
    p_limit: params.limit ?? 12,
  });
  if (error) throw error;
  return (data ?? []) as CommunityPost[];
}
```

- [ ] **Step 2: Query keys.** In `src/constants/queryKeys.ts`, inside the
  `community` family (next to `feed`), add:

```ts
    userPosts: {
      all: ['community', 'userPosts'] as const,
      of: (userId: Id) => ['community', 'userPosts', userId] as const,
    },
```

  Then add `queryKeys.community.userPosts.all` to the `DISCOVERY_FEED_KEYS`
  array (it shows other people's posts, so blocking must invalidate it).

- [ ] **Step 3: Hook.** Create `src/hooks/useUserPosts.ts`:

```ts
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getUserPosts, FeedCursor } from '@/services/community/posts.service';
import { nextCommunityCursor } from '@/hooks/useCommunityFeed';
import { useAuthStore } from '@/stores/authStore';

const PAGE_SIZE = 12;

// One profile's posts (the "Posts" tab). Viewer-scoped by the user_posts RPC's
// SECURITY INVOKER + posts RLS; the viewer is the signed-in user. Same keyset
// paging as the main feed.
export function useUserPosts(targetId: string | undefined) {
  const viewerId = useAuthStore((s) => s.user?.id);

  return useInfiniteQuery({
    queryKey: queryKeys.community.userPosts.of(targetId),
    queryFn: ({ pageParam }) =>
      getUserPosts({
        targetId: targetId!,
        viewerId: viewerId!,
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: null as FeedCursor | null,
    getNextPageParam: (lastPage) => nextCommunityCursor(lastPage, PAGE_SIZE),
    enabled: !!targetId && !!viewerId,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
```

- [ ] **Step 4:** `npm run typecheck` → 0. Commit
  (`feat(community): getUserPosts service + useUserPosts hook`).

---

### Task 3: Delete invalidates the profile tab too

**Files:**
- Modify: `src/hooks/usePostMutations.ts`

The feed delete path invalidates only `community.feed.all`. A post deleted from
the profile tab (or the feed) must also drop out of any `userPosts` query.

- [ ] **Step 1:** In `postMutations`, extend the `remove.onSuccess` to also
  invalidate the profile tab (and, for symmetry, do the same in `create.onSuccess`
  so a new post shows on your own profile without a manual refresh):

```ts
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.community.feed.all });
      qc.invalidateQueries({ queryKey: queryKeys.community.userPosts.all });
    },
```

  Apply the identical two-line body to **both** `create.onSuccess` and
  `remove.onSuccess`.

- [ ] **Step 2:** `npm run typecheck` → 0; `npx jest usePostMutations --forceExit`
  → green (existing mutation tests still pass — they assert the create path, not
  the invalidation set). Commit (`fix(community): delete/create invalidate profile posts too`).

---

### Task 4: ProfilePosts component (toggle + List via PostCard)

**Files:**
- Create: `src/components/community/ProfilePosts.tsx`

**Interfaces:**
- Consumes: `useUserPosts`, `PostCard`, `CommentSheet`, `useDeletePost`,
  `CommunityPost`, `Dialog` / `PressableScale` from `@/components/ui`.
- Produces: `<ProfilePosts userId={string} onDark?={boolean} />`. Self-contained:
  owns the Grid/List toggle state, the comment sheet, and the delete dialog.

Behaviour: a segmented **Grid | List** toggle (default **Grid**). List renders
the loaded posts as `PostCard`s with a "Load more" button when `hasNextPage`.
`isOwn` is `post.author_id === signed-in id` so overflow→delete only shows on your
own. Grid is Task 5 (this task ships List + the toggle + the shared sheets;
Grid renders a placeholder `null` until Task 5 fills it in).

- [ ] **Step 1: Build the component (List mode + toggle + sheets).**

```tsx
import { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PressableScale, Dialog, Button } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';
import { useUserPosts } from '@/hooks/useUserPosts';
import { useDeletePost } from '@/hooks/usePostMutations';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';
import { PostCard } from './PostCard';
import { CommentSheet } from './CommentSheet';
// PhotoGrid is added in Task 5.

type Mode = 'grid' | 'list';

// The Profile "Posts" tab, dropped into either profile screen. Self-contained:
// it owns the Grid/List toggle, the comment sheet, and the delete dialog, so the
// host screen adds one line. Viewer-scoped rows come from useUserPosts (RLS).
export function ProfilePosts({
  userId,
  onDark = false,
}: {
  userId: string;
  onDark?: boolean;
}) {
  const meId = useAuthStore((s) => s.user?.id);
  const q = useUserPosts(userId);
  const del = useDeletePost();
  const [mode, setMode] = useState<Mode>('grid');
  const [commentPost, setCommentPost] = useState<CommunityPost | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CommunityPost | null>(null);

  const posts = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);

  function confirmDelete() {
    if (!pendingDelete) return;
    del.mutate(pendingDelete.id, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPendingDelete(null);
      },
      onError: () =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    });
  }

  const labelColor = onDark ? styles.tabOnDark : styles.tab;
  const activeColor = onDark ? styles.tabOnDarkActive : styles.tabActive;

  return (
    <View>
      <View style={styles.toggle}>
        {(['grid', 'list'] as Mode[]).map((m) => (
          <PressableScale
            key={m}
            scaleTo={0.96}
            onPress={() => {
              Haptics.selectionAsync();
              setMode(m);
            }}
          >
            <Text style={[labelColor, mode === m && activeColor]}>
              {m === 'grid' ? 'Grid' : 'List'}
            </Text>
          </PressableScale>
        ))}
      </View>

      {posts.length === 0 ? (
        <Text style={[styles.empty, onDark && styles.emptyOnDark]}>
          No posts yet.
        </Text>
      ) : mode === 'list' ? (
        <View style={{ gap: SPACING[3] }}>
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              isOwn={p.author_id === meId}
              onOverflow={setPendingDelete}
              onComment={setCommentPost}
            />
          ))}
          {q.hasNextPage && (
            <Button
              label={q.isFetchingNextPage ? 'Loading…' : 'Load more'}
              variant="tertiary"
              size="md"
              onPress={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
            />
          )}
        </View>
      ) : (
        /* Grid — filled in Task 5. */
        null
      )}

      {commentPost && (
        <CommentSheet
          post={commentPost}
          visible={!!commentPost}
          onClose={() => setCommentPost(null)}
        />
      )}

      <Dialog visible={!!pendingDelete} onClose={() => setPendingDelete(null)}>
        <Text style={styles.dialogTitle}>Delete post?</Text>
        <Text style={styles.dialogBody}>This can&apos;t be undone.</Text>
        <View style={styles.dialogRow}>
          <PressableScale
            scaleTo={0.96}
            style={[styles.dialogBtn, styles.dialogCancel]}
            onPress={() => setPendingDelete(null)}
          >
            <Text style={styles.dialogCancelLabel}>Cancel</Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.96}
            style={[styles.dialogBtn, styles.dialogDelete]}
            onPress={confirmDelete}
            disabled={del.isPending}
          >
            <Text style={styles.dialogDeleteLabel}>Delete</Text>
          </PressableScale>
        </View>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', gap: SPACING[5], marginBottom: SPACING[4] },
  tab: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textMuted,
  },
  tabActive: { fontFamily: FONTS.heading, color: COLORS.textPrimary },
  tabOnDark: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textOnDarkMuted,
  },
  tabOnDarkActive: { fontFamily: FONTS.heading, color: COLORS.white },
  empty: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textMuted,
    paddingVertical: SPACING[2.5],
  },
  emptyOnDark: { color: COLORS.textOnDarkMuted },
  dialogTitle: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.titleLg,
    color: COLORS.textPrimary,
    marginBottom: SPACING[1],
  },
  dialogBody: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textSecondary,
    marginBottom: SPACING[4],
  },
  dialogRow: { flexDirection: 'row', gap: SPACING[2] },
  dialogBtn: {
    flex: 1,
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  dialogCancel: { backgroundColor: COLORS.inkSubtle },
  dialogDelete: { backgroundColor: COLORS.accent },
  dialogCancelLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textSecondary,
  },
  dialogDeleteLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.white,
  },
});
```

  Before writing the dialog styles, **open `app/(tabs)/community.tsx`** and copy
  its `dialogTitle`/`dialogBody`/`dialogBtn`/`dialogCancel*`/`dialogDelete*`
  token values verbatim so the two delete dialogs read identically (the snippet
  above is that shape; reconcile any token names that differ in the actual file).

- [ ] **Step 2:** `npm run typecheck` → 0; `npm run lint` on the file → no new.
  Commit (`feat(community): ProfilePosts component (List + toggle + sheets)`).

---

### Task 5: Grid mode — 3-column photo thumbnails + viewer

**Files:**
- Modify: `src/components/community/ProfilePosts.tsx`

**Interfaces:**
- Consumes: `useWindowDimensions`, `expo-image`, `Modal`/`FlatList` from
  react-native, `PhotoCarousel` (already built in 3a) for the viewer.

Behaviour: Grid shows **photo posts only** (`type === 'photo' && media.length`),
first image as a square thumbnail, 3 across with 2px gutters (Instagram look).
Tapping a tile opens a fullscreen `Modal` showing that post's `PhotoCarousel`
(read-only). Grid is view-only; delete/edit stays in List (spec: overflow menu,
one code path).

- [ ] **Step 1: Compute the photo subset + tile size.**

```ts
const { width } = useWindowDimensions();
// The grid bleeds to the profile's content width; 3 columns, 2px gutters.
const GUTTER = 2;
const photoPosts = useMemo(
  () => posts.filter((p) => p.type === 'photo' && p.media.length > 0),
  [posts]
);
const [viewerPost, setViewerPost] = useState<CommunityPost | null>(null);
```

  Compute tile size from the container width the profile gives this component.
  The profile sheets pad by `SPACING[5]` each side; pass the usable width in as a
  prop is overkill — instead measure with `onLayout` on the grid wrapper and
  divide: `const tile = (gridWidth - GUTTER * 2) / 3;`. Store `gridWidth` in
  state, default 0, render tiles only once `gridWidth > 0`.

- [ ] **Step 2: Render the grid** (replace the `null` Grid branch):

```tsx
<View
  style={styles.grid}
  onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
>
  {gridWidth > 0 &&
    photoPosts.map((p) => {
      const tile = (gridWidth - GUTTER * 2) / 3;
      return (
        <PressableScale
          key={p.id}
          scaleTo={0.97}
          style={{ width: tile, height: tile }}
          onPress={() => setViewerPost(p)}
          accessibilityRole="button"
          accessibilityLabel="View post"
        >
          <Image
            source={{ uri: p.media[0] }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
          />
        </PressableScale>
      );
    })}
</View>
```

  Grid styles: `grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GUTTER }`.
  Add the empty case for Grid: if `photoPosts.length === 0` show the same
  `No posts yet.` line (photo-less profiles shouldn't render an empty grid box).

- [ ] **Step 3: The read-only viewer Modal** (render alongside the CommentSheet):

```tsx
<Modal
  visible={!!viewerPost}
  animationType="fade"
  transparent
  statusBarTranslucent
  onRequestClose={() => setViewerPost(null)}
>
  <View style={styles.viewer}>
    {viewerPost && <PhotoCarousel media={viewerPost.media} />}
    <NavButton
      icon="close"
      color={COLORS.white}
      onPress={() => setViewerPost(null)}
      accessibilityLabel="Close"
      style={[styles.viewerClose, { top: insets.top + SPACING[2] }]}
    />
  </View>
</Modal>
```

  Add imports: `Modal`, `useWindowDimensions` (rn); `Image` (expo-image);
  `NavButton` (ui); `useSafeAreaInsets` (react-native-safe-area-context) for
  `insets`; `PhotoCarousel` (`./PhotoCarousel`). Viewer styles:
  `viewer: { flex: 1, backgroundColor: COLORS.lightbox, justifyContent: 'center' }`,
  `viewerClose: { position: 'absolute', right: SPACING[4] }`. Confirm `NavButton`
  accepts a `style` prop; if not, wrap it in a positioned `View` instead.

- [ ] **Step 4:** `npm run typecheck` → 0; `npm run lint` on the file → no new.
  Commit (`feat(community): ProfilePosts grid mode + photo viewer`).

---

### Task 6: Mount ProfilePosts in both profile screens

**Files:**
- Modify: `app/(tabs)/profile.tsx` (own profile)
- Modify: `app/friends/[userId].tsx` (other-user profile)

**Interfaces:**
- Consumes: `<ProfilePosts userId onDark />`.

Both screens are dark sheets over a photo (`onDark` content), so pass `onDark`.
Slot the section under the existing Events block so the profile reads
photo → stats → events → **Posts**.

- [ ] **Step 1: Own profile.** In `app/(tabs)/profile.tsx`, import
  `import { ProfilePosts } from '@/components/community/ProfilePosts';`. After the
  Upcoming/Attended `Animated.View` block (the one ending near the wishlist),
  add — before the wishlist — a new section:

```tsx
<Animated.View entering={FadeInDown.delay(215).duration(400)}>
  <Text style={styles.sectionTitle}>Posts</Text>
  <ProfilePosts userId={user.id} onDark />
</Animated.View>
```

  Reuse the screen's existing `styles.sectionTitle`. `user` is non-null here
  (past the `if (!user) return null` guard).

- [ ] **Step 2: Other-user profile.** In `app/friends/[userId].tsx`, import the
  same component. After the "Hosting" `theirEvents` block (before the blocked
  banner), add:

```tsx
<Animated.View entering={FadeInDown.delay(200).duration(400)}>
  <Text style={styles.sectionTitle}>Posts</Text>
  <ProfilePosts userId={userId} onDark />
</Animated.View>
```

  Use that screen's own `styles.sectionTitle` and its `userId` route param.
  (RLS already hides friends-only posts from a stranger, so no extra gating here.)

- [ ] **Step 3:** `npm run typecheck` → 0; `npm run lint` on both files → no new.
  Commit (`feat(community): mount Posts tab on both profile screens`).

---

### Verification
- `npm run typecheck` → 0; `npx jest --forceExit` → green; `npm run lint` on
  touched files → no new.
- Apply migration 057 in the Supabase SQL editor (whole file).
- Append a **Phase 3c** section to `docs/superpowers/tests/community-manual-qa.md`:
  - **DB / visibility:** as a stranger, `user_posts` returns only the target's
    **public** posts; as an accepted friend, public + friends; as self, all
    (including friends-only); a blocked pair sees nothing of each other.
  - **Device:** own profile shows Posts with Grid default; toggle to List (with
    `selectionAsync` haptic); Grid = photo posts only, 3-col, tap opens the
    fullscreen carousel; List = all types as `PostCard`; like + comment work from
    List; overflow→Delete on your own post removes it from List, Grid, **and** the
    main feed (shared invalidation); other-user profile shows the same tab with no
    delete affordance; empty profile shows "No posts yet."; Android flat-glass
    toggle + tiles legible.
- Update memory `community-phase-progress.md` (3c done, migration 057; Phase 3
  complete — final polish/text pass next).
