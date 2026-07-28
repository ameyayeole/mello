import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { PressableScale, Dialog, Button, NavButton } from '@/components/ui';
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
import { PhotoCarousel } from './PhotoCarousel';
import { CommentSheet } from './CommentSheet';

type Mode = 'grid' | 'list';

// 3-column grid, 2px gutters (Instagram look).
const GUTTER = 2;

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
  const insets = useSafeAreaInsets();
  const q = useUserPosts(userId);
  const del = useDeletePost();
  const [mode, setMode] = useState<Mode>('grid');
  const [commentPost, setCommentPost] = useState<CommunityPost | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CommunityPost | null>(null);
  const [reportTarget, setReportTarget] = useState<CommunityPost | null>(null);
  const [viewerPost, setViewerPost] = useState<CommunityPost | null>(null);

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
  // Measured from onLayout so tiles divide the width the profile gives us,
  // rather than guessing the sheet's padding. Tiles render once it's known.
  const [gridWidth, setGridWidth] = useState(0);

  const posts = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);
  // Grid is photo posts only (spec §11).
  const photoPosts = useMemo(
    () => posts.filter((p) => p.type === 'photo' && p.media.length > 0),
    [posts]
  );

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
      ) : photoPosts.length === 0 ? (
        <Text style={[styles.empty, onDark && styles.emptyOnDark]}>
          No photo posts yet.
        </Text>
      ) : (
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
      )}

      {/* Read-only fullscreen viewer for a tapped grid tile — reuses the 3a
          carousel. Delete/edit stays in List (spec: overflow menu, one path). */}
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

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GUTTER },
  viewer: {
    flex: 1,
    backgroundColor: COLORS.lightbox,
    justifyContent: 'center',
  },
  viewerClose: { position: 'absolute', right: SPACING[4] },

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
