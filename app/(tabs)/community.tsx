import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
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
import { useMutation } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reportPost } from '@/services/moderation.service';
import { SPACING, RADIUS } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { useCommunityFeed } from '@/hooks/useCommunityFeed';
import { useThreadMentionables } from '@/hooks/useMentions';
import { useDeletePost } from '@/hooks/usePostMutations';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
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
import { EventsRail } from '@/components/community/EventsRail';
import { ComposePostSheet } from '@/components/community/ComposePostSheet';
import { CommentSheet } from '@/components/community/CommentSheet';
import { errorMessage } from '@/utils/errors';

export default function CommunityScreen() {
  const tabBarInset = useTabBarInset();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const feed = useCommunityFeed();
  const meId = useAuthStore((s) => s.user?.id);
  const del = useDeletePost();
  const [composeOpen, setComposeOpen] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CommunityPost | null>(null);
  const [reportTarget, setReportTarget] = useState<CommunityPost | null>(null);
  const [commentPost, setCommentPost] = useState<CommunityPost | null>(null);

  const report = useMutation({
    mutationFn: (post: CommunityPost) =>
      reportPost({
        reporterId: meId!,
        reportedId: post.author_id,
        postId: post.id,
        // MVP: a single generic reason; a reason picker can come in polish.
        reason: 'inappropriate',
      }),
  });

  const posts = useMemo(
    () => feed.data?.pages.flat() ?? [],
    [feed.data]
  );

  // Resolves every @handle across all loaded feed pages (one keyed query) plus
  // the viewer → which caption handles render tappable. Same map CommentSheet
  // builds for a thread; useThreadMentionables is structural on `{ body }[]`.
  const mentionables = useThreadMentionables(posts);

  // "New posts ↑" pill. On a focus refetch the feed's top can change; if the
  // user is scrolled down we surface a pill rather than yanking them up. The
  // score is frozen within a session (materialized, 10-min refresh), so a
  // changed top id means genuinely new content, not a live re-rank.
  const listRef = useRef<FlatList<CommunityPost>>(null);
  const scrollY = useRef(0);
  const knownTopId = useRef<string | null>(null);
  const [showNewPill, setShowNewPill] = useState(false);

  // Refetch when the tab regains focus. Depend on the STABLE `feed.refetch`
  // reference, not the whole `feed` object — `feed` is a new object every render,
  // so `[feed]` made this callback change every render and useFocusEffect re-ran
  // it on every render → an infinite refetch loop (the feed jittering up/down).
  //
  // Deliberately silent and deliberately unconditional. You see the cached feed
  // the instant the tab opens and the fresh one replaces it when it lands, with
  // nothing on screen to say so: `isLoading` is false while there is cached
  // data, and the pull-to-refresh spinner belongs to the gesture alone now (see
  // usePullToRefresh). It used to be wired to `isRefetching`, which is how this
  // background pass ended up yanking the refresh control half open and shut on
  // every visit to the tab.
  const refetch = feed.refetch;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    // A manual refresh means the user is looking at the top — adopt whatever
    // comes back and clear any pending pill.
    knownTopId.current = posts[0]?.id ?? null;
    setShowNewPill(false);
    await refetch();
  });

  useEffect(() => {
    const topId = posts[0]?.id;
    if (!topId) return;
    if (knownTopId.current === null) {
      knownTopId.current = topId; // first load — nothing is "new"
      return;
    }
    if (topId !== knownTopId.current) {
      // New content at the top. Scrolled down → surface the pill; near the top
      // → adopt it silently (the user is already seeing it).
      if (scrollY.current > 400) setShowNewPill(true);
      else knownTopId.current = topId;
    }
  }, [posts]);

  const jumpToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    knownTopId.current = posts[0]?.id ?? null;
    setShowNewPill(false);
    Haptics.selectionAsync();
  }, [posts]);

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
            ref={listRef}
            data={posts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.list, { paddingBottom: tabBarInset }]}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
            }}
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
              <>
                <Animated.View
                  entering={FadeInDown.delay(Math.min(index, 6) * 60).duration(350)}
                >
                  <PostCard
                    post={item}
                    onOverflow={onOverflow}
                    onComment={onComment}
                    mentionables={mentionables}
                  />
                </Animated.View>
                {/* City events rail woven in every ~9 posts (spec §8); it
                    self-hides when nothing is nearby. */}
                {(index + 1) % 9 === 0 ? <EventsRail /> : null}
              </>
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
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

      {showNewPill ? (
        <PressableScale
          style={[styles.newPill, { top: insets.top + 52 }]}
          onPress={jumpToTop}
          accessibilityRole="button"
          accessibilityLabel="Scroll to new posts"
        >
          <Text style={styles.newPillText}>New posts ↑</Text>
        </PressableScale>
      ) : null}

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
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.dialogCancelLabel}>Cancel</Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.96}
            style={[styles.dialogBtn, styles.dialogDeleteBtn]}
            onPress={confirmReport}
            disabled={report.isPending}
            accessibilityRole="button"
            accessibilityLabel="Report"
          >
            <Text style={styles.dialogDeleteLabel}>Report</Text>
          </PressableScale>
        </View>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Floating coral pill, centred under the header. `top` is set inline from the
  // safe-area inset so it clears the notch + header on every device.
  newPill: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 10,
    paddingVertical: SPACING[2],
    paddingHorizontal: SPACING[4],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  newPillText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.white,
  },
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
