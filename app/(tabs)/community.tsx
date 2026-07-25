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
import { SPACING, RADIUS } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { useCommunityFeed } from '@/hooks/useCommunityFeed';
import { useDeletePost } from '@/hooks/usePostMutations';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';
import {
  EmptyState,
  Loader,
  Screen,
  IconButton,
  Dialog,
  PressableScale,
  useTabBarInset,
} from '@/components/ui';
import { PostCard } from '@/components/community/PostCard';
import { CommunityNudgeCard } from '@/components/community/CommunityNudgeCard';
import { ComposePostSheet } from '@/components/community/ComposePostSheet';
import { CommentSheet } from '@/components/community/CommentSheet';
import { errorMessage } from '@/utils/errors';

export default function CommunityScreen() {
  const tabBarInset = useTabBarInset();
  const router = useRouter();
  const feed = useCommunityFeed();
  const meId = useAuthStore((s) => s.user?.id);
  const del = useDeletePost();
  const [composeOpen, setComposeOpen] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CommunityPost | null>(null);
  const [commentPost, setCommentPost] = useState<CommunityPost | null>(null);

  const posts = useMemo(
    () => feed.data?.pages.flat() ?? [],
    [feed.data]
  );

  const openCompose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setComposeOpen(true);
  }, []);

  const onComment = useCallback((p: CommunityPost) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCommentPost(p);
  }, []);

  // Nudge shows when the feed is genuinely thin and not dismissed this session.
  // Suppressed on error so it doesn't stack over the retry state.
  const showNudge =
    !nudgeDismissed && !feed.isLoading && !feed.isError && posts.length < 3;

  // Own-post overflow only: report arrives in a later phase.
  function onOverflow(post: CommunityPost) {
    setPendingDelete(post);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    del.mutate(pendingDelete.id, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPendingDelete(null);
      },
      onError: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      },
    });
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
                <PostCard
                  post={item}
                  isOwn={item.author_id === meId}
                  onOverflow={onOverflow}
                  onComment={onComment}
                />
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
    // Match the Notifications header scale so the tabs read consistently.
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.display,
    letterSpacing: -1,
    color: COLORS.textPrimary,
  },
  list: { padding: SPACING[4], paddingTop: SPACING[1], gap: SPACING[3] },
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
