# Community Phase 7 — Share + deep links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make a post shareable and linkable — enable the share glyph (native
share sheet → external apps + copy), a `mello://post/<id>` deep link that opens a
**post detail screen**, and route post notifications to that screen instead of the
generic feed.

**Architecture:** A `get_post(post_id, viewer_id)` RPC returns one post in the
**exact `community_feed` row shape** (SECURITY INVOKER → posts RLS decides
visibility), so the detail screen reuses `PostCard`, `CommentSheet`, delete and
report unchanged. `sharePost` mirrors the existing `shareEvent` util
(`Linking.createURL('post/<id>')` + native `Share`). The incoming side reuses the
established `+native-intent.ts` + notification-tap plumbing — the file already has
a `post/<id>` stub that currently falls back to the feed; this phase points it at
the real route and updates `onPressNotif` to deep-link post events by `post_id`.

**Tech Stack:** Supabase plpgsql, expo-router, expo-linking, React Native `Share`.

## Global Constraints
- Never hardcode a colour/font/radius — `COLORS` / `FONTS` / `TYPE_SIZE` / `RADIUS` / `SPACING`.
- Reuse, don't fork: `PostCard`, `CommentSheet`, `useDeletePost`, `reportPost`,
  the `shareEvent` util shape, `Screen` / `ScreenHeader`, `queryKeys.community.post`.
- **Path convention:** the app already uses `mello://event/<id>` and a `post/<id>`
  stub in `+native-intent.ts` — use **`post/<id>`** (not the spec's `/p/:id`
  shorthand) so the one existing regex keeps working; note the choice in a comment.
- **Send-to-DM is deferred** to the final polish pass (it needs a friend-picker +
  chat-message insert); the native share sheet already covers external + copy.
- Friends-only posts stay un-shareable-beyond-audience by construction — the deep
  link still resolves, but `get_post` returns nothing to a viewer RLS excludes, so
  the detail screen shows a "post unavailable" state.

---

### Task 1: Migration 063 — get_post RPC

**Files:**
- Create: `supabase/migrations/063_get_post.sql`

**Interfaces:**
- Produces: `get_post(p_post_id UUID, p_user_id UUID)` returning **0 or 1 row** in
  the `community_feed` v5 column shape (incl. `ref_wrap_event_id`, `score`).

Design notes:
- `SECURITY INVOKER` → posts RLS gates visibility; a viewer who can't see the post
  gets no row (the screen renders "unavailable"). `hidden` posts return nothing.
- Same SELECT columns as `community_feed` (062) minus the keyset/order/limit.
- Header must NOT start a line with the `COMMENT` keyword. Run whole file.

- [ ] **Step 1: Write the migration**

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- GET_POST: one post in the community_feed row shape, for the post detail screen
-- (deep links + notification tap-through). SECURITY INVOKER → posts RLS decides
-- visibility, so a viewer who can't see it (or a hidden post) gets no row and the
-- screen shows "unavailable". Run whole file in the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_post(UUID, UUID);
CREATE OR REPLACE FUNCTION get_post(p_post_id UUID, p_user_id UUID)
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
  SELECT
    p.id, p.author_id, pr.name, pr.photo_url, p.type, p.visibility,
    p.body, p.media, p.city, p.like_count, p.comment_count, p.created_at,
    EXISTS (SELECT 1 FROM post_likes pl
            WHERE pl.post_id = p.id AND pl.user_id = p_user_id) AS liked_by_me,
    p.comments_enabled,
    p.ref_wrap_event_id,
    p.score
  FROM posts p
  JOIN profiles pr ON pr.id = p.author_id
  WHERE p.id = p_post_id AND p.hidden = FALSE;
$$;
```

- [ ] **Step 2: Commit** (`feat(community): get_post RPC for detail screen (063)`)

---

### Task 2: getPost service + usePost hook

**Files:**
- Modify: `src/services/community/posts.service.ts` (`getPost`)
- Create: `src/hooks/usePost.ts`

**Interfaces:**
- Produces: `getPost(postId, viewerId) => Promise<CommunityPost | null>`;
  `usePost(postId)` query keyed by `queryKeys.community.post.of(postId)`.

- [ ] **Step 1: Service.** Add to `posts.service.ts`:

```ts
export async function getPost(
  postId: string,
  viewerId: string
): Promise<CommunityPost | null> {
  const { data, error } = await supabase.rpc('get_post', {
    p_post_id: postId,
    p_user_id: viewerId,
  });
  if (error) throw error;
  const rows = (data ?? []) as CommunityPost[];
  return rows[0] ?? null;
}
```

- [ ] **Step 2: Hook.** Create `src/hooks/usePost.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getPost } from '@/services/community/posts.service';
import { useAuthStore } from '@/stores/authStore';

// One post for the detail screen (deep link / notification tap). Returns null
// when the viewer can't see it (RLS) or it's hidden → the screen shows a
// graceful unavailable state.
export function usePost(postId: string) {
  const viewerId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: queryKeys.community.post.of(postId),
    queryFn: () => getPost(postId, viewerId!),
    enabled: !!viewerId && !!postId,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 3:** `npm run typecheck` → 0. Commit
  (`feat(community): getPost service + usePost hook`).

---

### Task 3: Post detail screen — app/post/[postId].tsx

**Files:**
- Create: `app/post/[postId].tsx`

**Interfaces:**
- Consumes: `usePost`, `PostCard`, `CommentSheet`, `useDeletePost`, `reportPost`,
  `useThreadMentionables`, `Screen`, `ScreenHeader`, `Dialog`.

Behaviour: a single-post screen reachable at `mello://post/<id>` and from a
notification. Renders the `PostCard` (delete-own / report-other via overflow,
comment via the sheet) inside a `Screen`. Loading → `Loader`; null (unavailable /
deleted / not visible) → an `EmptyState`. It is essentially a one-post Community
screen and reuses the same handlers.

- [ ] **Step 1: Build the screen.** A trimmed mirror of `app/(tabs)/community.tsx`'s
  post-handling (overflow branch, delete `Dialog`, report `Dialog`, `CommentSheet`),
  for a single `usePost(postId)` result:

```tsx
import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Screen, ScreenHeader, Loader, EmptyState, Dialog, PressableScale } from '@/components/ui';
import { PostCard } from '@/components/community/PostCard';
import { CommentSheet } from '@/components/community/CommentSheet';
import { usePost } from '@/hooks/usePost';
import { useDeletePost } from '@/hooks/usePostMutations';
import { useThreadMentionables } from '@/hooks/useMentions';
import { reportPost } from '@/services/moderation.service';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';

export default function PostDetailScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const meId = useAuthStore((s) => s.user?.id);
  const q = usePost(postId!);
  const del = useDeletePost();
  const [commentPost, setCommentPost] = useState<CommunityPost | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CommunityPost | null>(null);
  const [reportTarget, setReportTarget] = useState<CommunityPost | null>(null);
  const post = q.data ?? null;
  const mentionables = useThreadMentionables(post ? [post] : []);

  const report = useMutation({
    mutationFn: (p: CommunityPost) =>
      reportPost({ reporterId: meId!, reportedId: p.author_id, postId: p.id, reason: 'inappropriate' }),
  });

  function onOverflow(p: CommunityPost) {
    if (p.author_id === meId) setPendingDelete(p);
    else setReportTarget(p);
  }
  function confirmDelete() {
    if (!pendingDelete) return;
    del.mutate(pendingDelete.id, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPendingDelete(null);
        router.back(); // the post is gone; leave the dead screen
      },
      onError: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    });
  }
  function confirmReport() {
    if (!reportTarget) return;
    report.mutate(reportTarget, {
      onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setReportTarget(null); },
      onError: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); setReportTarget(null); },
    });
  }

  return (
    <Screen>
      <ScreenHeader title="Post" />
      {q.isLoading ? (
        <Loader />
      ) : !post ? (
        <EmptyState
          icon="close"
          title="Post unavailable"
          body="It may have been deleted or isn't visible to you."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <PostCard
            post={post}
            onOverflow={onOverflow}
            onComment={setCommentPost}
            mentionables={mentionables}
          />
        </ScrollView>
      )}

      {commentPost && (
        <CommentSheet post={commentPost} visible={!!commentPost} onClose={() => setCommentPost(null)} />
      )}

      {/* Delete + Report dialogs — same shape as the feed's (community.tsx). */}
      <Dialog visible={!!pendingDelete} onClose={() => setPendingDelete(null)}>
        <Text style={styles.dialogTitle}>Delete post?</Text>
        <Text style={styles.dialogBody}>This can&apos;t be undone.</Text>
        <View style={styles.dialogRow}>
          <PressableScale scaleTo={0.96} style={[styles.dialogBtn, styles.cancel]} onPress={() => setPendingDelete(null)}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </PressableScale>
          <PressableScale scaleTo={0.96} style={[styles.dialogBtn, styles.danger]} onPress={confirmDelete} disabled={del.isPending}>
            <Text style={styles.dangerLabel}>Delete</Text>
          </PressableScale>
        </View>
      </Dialog>
      <Dialog visible={!!reportTarget} onClose={() => setReportTarget(null)}>
        <Text style={styles.dialogTitle}>Report post?</Text>
        <Text style={styles.dialogBody}>Our team will review it. Posts reported by several people are hidden automatically.</Text>
        <View style={styles.dialogRow}>
          <PressableScale scaleTo={0.96} style={[styles.dialogBtn, styles.cancel]} onPress={() => setReportTarget(null)}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </PressableScale>
          <PressableScale scaleTo={0.96} style={[styles.dialogBtn, styles.danger]} onPress={confirmReport} disabled={report.isPending}>
            <Text style={styles.dangerLabel}>Report</Text>
          </PressableScale>
        </View>
      </Dialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: SPACING[4], paddingBottom: SPACING[8] },
  dialogTitle: { fontFamily: FONTS.heavy, fontSize: TYPE_SIZE.section, color: COLORS.textPrimary, textAlign: 'center' },
  dialogBody: { fontFamily: FONTS.medium, fontSize: TYPE_SIZE.caption, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING[2] },
  dialogRow: { flexDirection: 'row', gap: SPACING[2], alignSelf: 'stretch', marginTop: SPACING[4] },
  dialogBtn: { flex: 1, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: COLORS.inkSubtle },
  cancelLabel: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.bodyMd, color: COLORS.textPrimary },
  danger: { backgroundColor: COLORS.error },
  dangerLabel: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.bodyMd, color: COLORS.white },
});
```

  Confirm `EmptyState` accepts `icon/title/body/actionLabel/onAction` (it's used
  that way in `community.tsx`). Confirm the route folder `app/post/` needs no
  `_layout` (expo-router picks up the file route; a stack is provided by the root).

- [ ] **Step 2:** `npm run typecheck` → 0; `npm run lint` on the file → no new.
  Commit (`feat(community): post detail screen (/post/[postId])`).

---

### Task 4: sharePost util + enable the share glyph

**Files:**
- Create: `src/utils/sharePost.ts`
- Modify: `src/components/community/PostActionBar.tsx`

**Interfaces:**
- Produces: `sharePost(post: { id: string; body: string | null; author_name: string })`.

- [ ] **Step 1: Util.** Mirror `shareEvent.ts`:

```ts
import { Share } from 'react-native';
import * as Linking from 'expo-linking';

// Share a post via the native sheet (external apps + the OS "Copy" action). The
// message carries a mello://post/<id> deep link; +native-intent + useDeepLinks
// resolve it to the post detail screen. Send-to-a-Mello-DM is a later add.
export async function sharePost(post: {
  id: string;
  body: string | null;
  author_name: string;
}): Promise<void> {
  const url = Linking.createURL(`post/${post.id}`);
  const preview = post.body ? `"${post.body.slice(0, 100)}"` : `${post.author_name} on Mello`;
  const message = `${preview}\n\n👉 ${url}`;
  try {
    await Share.share({ message });
  } catch {
    // User dismissed the sheet — nothing to do.
  }
}
```

- [ ] **Step 2: Enable the glyph.** In `PostActionBar.tsx`, replace the disabled
  placeholder `View` with a `PressableScale`:

```tsx
<PressableScale
  onPress={() => sharePost(post)}
  style={styles.action}
  accessibilityRole="button"
  accessibilityLabel="Share"
>
  <Icon name="share" size={20} color={COLORS.textMuted} />
</PressableScale>
```

  Import `sharePost`; drop the now-unused `styles.disabled` (or leave it — but
  remove the `disabled` usage). Update the component's top comment: share is live
  (was a Phase-7 placeholder).

- [ ] **Step 3:** `npm run typecheck` → 0; `npm run lint` touched → no new. Commit
  (`feat(community): enable post share (native sheet + deep link)`).

---

### Task 5: Deep-link routing — native-intent + notification tap-through

**Files:**
- Modify: `app/+native-intent.ts`
- Modify: `app/notifications.tsx` (`onPressNotif` post events → detail screen)

- [ ] **Step 1: native-intent.** Point the existing `post/<id>` branch at the real
  route:

```ts
const post = path.match(/(?:^|\/)post\/([^/?#]+)/);
if (post?.[1]) {
  return `/post/${decodeURIComponent(post[1])}`;
}
```

  (Replaces the "lands in Phase 7 → feed" stub.)

- [ ] **Step 2: Notifications.** In `onPressNotif`, the `post_liked` /
  `post_commented` / `comment_reply` / `comment_liked` / `comment_mention` /
  `post_mention` / `poll_closed` group currently all go to `/(tabs)/community`.
  Change it to deep-link the specific post when the payload carries a `post_id`,
  falling back to the feed:

```ts
case 'post_liked':
case 'post_commented':
case 'comment_reply':
case 'comment_liked':
case 'comment_mention':
case 'post_mention':
case 'poll_closed': {
  const pid = notif.payload?.post_id as string | undefined;
  return dismiss(() =>
    router.push(pid ? `/post/${pid}` : '/(tabs)/community')
  );
}
```

  (Comment notifications carry `post_id` in their payload from migration 049/055;
  `comment_reply` carries `parent_id` — if `post_id` is absent it falls back to the
  feed, which is still correct. Verify the payload key names against the notify
  triggers; use `post_id` where present.)

- [ ] **Step 3:** `npm run typecheck` → 0; `npm run lint` touched → no new;
  `npx jest --forceExit` → green. Commit
  (`feat(community): deep-link posts from links + notifications`).

---

### Verification
- `npm run typecheck` → 0; `npx jest --forceExit` → green; `npm run lint` on
  touched files → no new.
- Apply migration **063** in the Supabase SQL editor (whole file).
- Append a **Phase 7** section to `docs/superpowers/tests/community-manual-qa.md`:
  - **DB:** `get_post(post, viewer)` returns the row for a visible post and
    **no row** for a friends-only post the viewer can't see or a hidden post.
  - **Device:** the share glyph opens the native sheet; sharing/copy yields a
    `mello://post/<id>` link; opening that link (cold + warm) lands on the post
    detail screen; a link to a post you can't see shows "Post unavailable";
    tapping a `post_liked`/`post_commented`/`poll_closed`/mention notification opens
    the **specific post** (not just the feed); like/comment/delete/report all work
    from the detail screen; Android back returns cleanly.
  - **Deferred:** Send-to-a-Mello-DM (friend-picker + chat insert) — final polish.
- Update memory `community-feed-project.md` (Phase 7 done, migration 063; **all 7
  build phases complete**; remaining: final text/polish pass — incl. send-to-DM and
  the "new posts ↑" pill).
