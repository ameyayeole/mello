import { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PressableScale, Dialog, Button } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';
import { useMutation } from '@tanstack/react-query';
import { useUserPosts } from '@/hooks/useUserPosts';
import { useDeletePost } from '@/hooks/usePostMutations';
import { reportPost } from '@/services/moderation.service';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';
import { PostCard } from './PostCard';
import { CommentSheet } from './CommentSheet';

// How close to the end of the *host page* counts as "near the bottom". Lives
// here rather than in each screen so the two profiles can't drift apart.
export const POSTS_NEAR_BOTTOM_PX = 500;

// The Profile "Posts" tab, dropped into either profile screen. Self-contained:
// it owns the comment sheet and the delete dialog, so the host screen adds one
// line. Viewer-scoped rows come from useUserPosts (RLS). Delete runs the same
// useDeletePost path as the feed (spec: one code path).
//
// Posts render with .map() into the host's ScrollView on purpose. A FlatList
// here would be a list nested inside a scroll view of the same orientation:
// it gets an unbounded height, so windowing never engages and onEndReached
// never fires. Instead the host — which owns the only real scroll view —
// tells us when the user is near the bottom via `nearBottom`.
export function ProfilePosts({
  userId,
  onDark = false,
  nearBottom = false,
}: {
  userId: string;
  onDark?: boolean;
  /** Host sets this true while the page is scrolled within
   *  POSTS_NEAR_BOTTOM_PX of its end. Each rising edge asks for one more page. */
  nearBottom?: boolean;
}) {
  const meId = useAuthStore((s) => s.user?.id);
  const q = useUserPosts(userId);
  const del = useDeletePost();
  const [commentPost, setCommentPost] = useState<CommunityPost | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CommunityPost | null>(null);
  const [reportTarget, setReportTarget] = useState<CommunityPost | null>(null);

  const report = useMutation({
    mutationFn: (post: CommunityPost) =>
      reportPost({
        reporterId: meId!,
        reportedId: post.author_id,
        postId: post.id,
        reason: 'inappropriate',
      }),
  });

  // Overflow branches on ownership: Delete your own, Report someone else's.
  function onOverflow(post: CommunityPost) {
    if (post.author_id === meId) setPendingDelete(post);
    else setReportTarget(post);
  }

  function confirmReport() {
    if (!reportTarget) return;
    report.mutate(reportTarget, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setReportTarget(null);
      },
      onError: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setReportTarget(null);
      },
    });
  }
  const posts = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);

  // Fire on the RISING edge only. Holding `nearBottom` true would otherwise
  // re-trigger every time a page landed and pull the whole table down in one
  // go: growing the content does not itself emit a scroll event, so the flag
  // can stay true with nothing left to re-evaluate it. One page per entry into
  // the zone; scrolling out and back in arms it again. The user who stops dead
  // inside the zone gets no further pages — that is what "Load more" is for.
  const wasNearBottom = useRef(false);
  useEffect(() => {
    const entered = nearBottom && !wasNearBottom.current;
    wasNearBottom.current = nearBottom;
    if (!entered) return;
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [nearBottom, q]);

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

  return (
    <View>
      {posts.length === 0 ? (
        <Text style={[styles.empty, onDark && styles.emptyOnDark]}>
          No posts yet.
        </Text>
      ) : (
        <View style={{ gap: SPACING[3] }}>
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onOverflow={onOverflow}
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
      )}

      {commentPost && (
        <CommentSheet
          post={commentPost}
          visible={!!commentPost}
          onClose={() => setCommentPost(null)}
        />
      )}

      {/* Same shape/tokens as the feed's delete dialog (app/(tabs)/community.tsx)
          so the two read identically — this is the shared delete affordance. */}
      <Dialog visible={!!pendingDelete} onClose={() => setPendingDelete(null)}>
        <Text style={styles.dialogTitle}>Delete post?</Text>
        <Text style={styles.dialogBody}>This can&apos;t be undone.</Text>
        <View style={styles.dialogButtonRow}>
          <PressableScale
            scaleTo={0.96}
            style={[styles.dialogBtn, styles.dialogCancelBtn]}
            onPress={() => setPendingDelete(null)}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.dialogCancelLabel}>Cancel</Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.96}
            style={[styles.dialogBtn, styles.dialogDeleteBtn]}
            onPress={confirmDelete}
            disabled={del.isPending}
            accessibilityRole="button"
            accessibilityLabel="Delete"
          >
            <Text style={styles.dialogDeleteLabel}>Delete</Text>
          </PressableScale>
        </View>
      </Dialog>

      <Dialog visible={!!reportTarget} onClose={() => setReportTarget(null)}>
        <Text style={styles.dialogTitle}>Report post?</Text>
        <Text style={styles.dialogBody}>
          Our team will review it. Posts reported by several people are hidden
          automatically.
        </Text>
        <View style={styles.dialogButtonRow}>
          <PressableScale
            scaleTo={0.96}
            style={[styles.dialogBtn, styles.dialogCancelBtn]}
            onPress={() => setReportTarget(null)}
          >
            <Text style={styles.dialogCancelLabel}>Cancel</Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.96}
            style={[styles.dialogBtn, styles.dialogDeleteBtn]}
            onPress={confirmReport}
            disabled={report.isPending}
          >
            <Text style={styles.dialogDeleteLabel}>Report</Text>
          </PressableScale>
        </View>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textMuted,
    paddingVertical: SPACING[2.5],
  },
  emptyOnDark: { color: COLORS.textOnDarkMuted },

  // Delete dialog — token-for-token with the feed's confirm (community.tsx).
  dialogTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  dialogBody: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[2],
  },
  dialogButtonRow: {
    flexDirection: 'row',
    gap: SPACING[2],
    alignSelf: 'stretch',
    marginTop: SPACING[4],
  },
  dialogBtn: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogCancelBtn: { backgroundColor: COLORS.inkSubtle },
  dialogCancelLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  dialogDeleteBtn: { backgroundColor: COLORS.error },
  dialogDeleteLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.white,
  },
});
