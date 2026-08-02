import { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Button } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { useUserPosts } from '@/hooks/useUserPosts';
import { useDeletePost, useReportPost } from '@/hooks/usePostMutations';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';
import { PostCard } from './PostCard';
import { CommentSheet } from './CommentSheet';
import { PostInteractionDialog } from './PostInteractionDialog';

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
  const report = useReportPost();
  const [commentPost, setCommentPost] = useState<CommunityPost | null>(null);
  const [interactionDialog, setInteractionDialog] = useState<{
    type: 'delete' | 'report' | null;
    post: CommunityPost | null;
  }>({ type: null, post: null });

  // Overflow branches on ownership: Delete your own, Report someone else's.
  function onOverflow(post: CommunityPost) {
    if (post.author_id === meId) setInteractionDialog({ type: 'delete', post });
    else setInteractionDialog({ type: 'report', post });
  }

  function confirmReport() {
    if (!interactionDialog.post) return;
    report.mutate(
      {
        postId: interactionDialog.post.id,
        authorId: interactionDialog.post.author_id,
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setInteractionDialog({ type: null, post: null });
        },
        onError: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setInteractionDialog({ type: null, post: null });
        },
      }
    );
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
    if (!interactionDialog.post) return;
    del.mutate(interactionDialog.post.id, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setInteractionDialog({ type: null, post: null });
      },
      onError: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setInteractionDialog({ type: null, post: null });
      },
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
              profileUserId={userId}
              onDark={onDark}
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

      {interactionDialog.type === 'delete' && interactionDialog.post && (
        <PostInteractionDialog
          visible={true}
          title="Delete post?"
          body="This can't be undone."
          actionLabel="Delete"
          onConfirm={confirmDelete}
          onClose={() => setInteractionDialog({ type: null, post: null })}
          isLoading={del.isPending}
        />
      )}

      {interactionDialog.type === 'report' && interactionDialog.post && (
        <PostInteractionDialog
          visible={true}
          title="Report post?"
          body="Our team will review it. Posts reported by several people are hidden automatically."
          actionLabel="Report"
          onConfirm={confirmReport}
          onClose={() => setInteractionDialog({ type: null, post: null })}
          isLoading={report.isPending}
        />
      )}
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
});
