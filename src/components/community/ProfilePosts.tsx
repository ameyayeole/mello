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

type Mode = 'grid' | 'list';

// The Profile "Posts" tab, dropped into either profile screen. Self-contained:
// it owns the Grid/List toggle, the comment sheet, and the delete dialog, so the
// host screen adds one line. Viewer-scoped rows come from useUserPosts (RLS).
// Delete runs the same useDeletePost path as the feed (spec: one code path).
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

  const labelStyle = onDark ? styles.tabOnDark : styles.tab;
  const activeStyle = onDark ? styles.tabOnDarkActive : styles.tabActive;

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
            <Text style={[labelStyle, mode === m && activeStyle]}>
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
