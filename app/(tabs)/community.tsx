import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useMutation, useQueryClient, InfiniteData } from '@tanstack/react-query';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reportPost } from '@/services/moderation.service';
import { FeedPageParam } from '@/services/community/posts.service';
import { queryKeys } from '@/constants/queryKeys';
import { SPACING, RADIUS } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { useCommunityFeed, pinOwnPosts } from '@/hooks/useCommunityFeed';
import { useThreadMentionables } from '@/hooks/useMentions';
import { useDeletePost } from '@/hooks/usePostMutations';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useImpressionTracker } from '@/hooks/useImpressionTracker';
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
import { CommentSheet } from '@/components/community/CommentSheet';
import { errorMessage } from '@/utils/errors';
import { themedStyles } from '@/theme';

// How often the events rail is woven into the feed (spec §8). Consumed by
// both the inline weave in `renderItem` and the footer's duplicate-rail
// guard below — they must agree, or the rail either doubles up or vanishes
// at the seam between the list and its footer.
const EVENTS_RAIL_CADENCE = 9;

export default function CommunityScreen() {
  const tabBarInset = useTabBarInset();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Whether the next session build should float your own fresh post to the top.
  // Posting turns it on; asking for a refresh turns it off. That is the whole
  // rule: refreshing repeatedly inside the 5-minute window should not keep
  // parking your own post at the top.
  //
  // Module-level (see useCommunityFeed) rather than a ref here, because the
  // composer is its own route now and can no longer be handed a callback from
  // this screen. Still a mutable object for the original reason: pull-to-refresh
  // sets it false and rebuilds in the same tick, which a state update would
  // not survive.
  const feed = useCommunityFeed(pinOwnPosts);
  // Records what the viewer actually sees, so the ranker can stop re-serving
  // posts they have already scrolled past (migration 065/066).
  const impressions = useImpressionTracker();
  const meId = useAuthStore((s) => s.user?.id);
  const del = useDeletePost();
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
    // Surgical cache edit, not `invalidateQueries`. Invalidating re-runs page 1
    // with `sessionId: null`, which builds a brand-new ranked session — the
    // whole feed reorders under the user's thumb. That is acceptable right
    // after deleting your own post (useDeletePost does invalidate), but
    // reporting happens mid-scroll on someone else's card and a reshuffled
    // feed there reads as a bug, not a confirmation. Migration 068's RLS
    // already excludes a reported post from `posts_select`, so dropping it
    // from the cached pages here is just applying on screen what the next
    // natural session rebuild would apply anyway — there is nothing left to
    // reconcile, which is what makes doing it locally safe.
    //
    // Runs in onSuccess only: a failed report leaves the post in the cache
    // and on screen, matching the DB state (nothing was hidden).
    onSuccess: (_data, post) => {
      queryClient.setQueryData<InfiniteData<CommunityPost[], FeedPageParam>>(
        queryKeys.community.feed.of(meId),
        (old) => {
          // No cache entry to edit (e.g. query never ran) — leave it be
          // rather than inventing an empty `InfiniteData` shape.
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => page.filter((p) => p.id !== post.id)),
          };
        }
      );
      // A page shortened by one is safe: pagination advances on `offset`
      // against `session_total` (nextFeedPage, useCommunityFeed.ts), never on
      // page length, so this can't trick the pager into ending the feed early.
    },
  });

  // Deduped by id, not just flattened. A tier advance rebuilds the pool, so a
  // post that entered it between builds can legitimately be served twice. One
  // line here is robust against every cross-tier case and cannot drift out of
  // sync with the ranking, which a SQL-side fix would.
  const posts = useMemo(() => {
    const seen = new Set<string>();
    return (feed.data?.pages.flat() ?? []).filter((p) =>
      seen.has(p.id) ? false : (seen.add(p.id), true)
    );
  }, [feed.data]);

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

  const queryClient = useQueryClient();

  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    // A manual refresh means the user is looking at the top — adopt whatever
    // comes back and clear any pending pill.
    knownTopId.current = posts[0]?.id ?? null;
    setShowNewPill(false);
    // The gesture half of the pin release. Set BEFORE the rebuild: the ref is
    // read inside queryFn, so the very next request already carries it.
    pinOwnPosts.current = false;
    // resetQueries, not refetch. An infinite query's refetch re-runs every
    // LOADED page against its stored pageParam — i.e. against the OLD session
    // id — so the ranking would never change and the pin would never drop.
    // resetQueries discards the pages, returns the query to initialPageParam
    // (a fresh tier-1 session) and refetches it.
    await queryClient.resetQueries({
      queryKey: queryKeys.community.feed.of(meId),
    });
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
    router.push('/community/compose');
  }, [router]);

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
            onViewableItemsChanged={impressions.onViewableItemsChanged}
            viewabilityConfig={impressions.viewabilityConfig}
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
                {(index + 1) % EVENTS_RAIL_CADENCE === 0 ? <EventsRail /> : null}
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
              ) : !feed.hasNextPage && posts.length > 0 && !showNudge ? (
                /* The end of the tail. Every tier is exhausted and no seen post
                   is ever re-served, so this is a real stopping point rather
                   than a spinner that never resolves.
                   `!showNudge` (reused, not re-derived) covers the thin-feed
                   case the `posts.length > 0` guard alone misses: with 1-2
                   posts and every tier exhausted, the nudge is already telling
                   the user their feed needs help — "all caught up" would
                   contradict it right below, and the nudge is the more useful,
                   actionable message here. */
                <View style={styles.caughtUp}>
                  <Text style={styles.caughtUpTitle}>You&apos;re all caught up</Text>
                  <Text style={styles.caughtUpBody}>
                    Check back later, or find something to do nearby.
                  </Text>
                  {/* Skip the rail if the inline weave (every EVENTS_RAIL_CADENCE-th
                      post, in renderItem above) already placed one right before
                      this — posts.length % EVENTS_RAIL_CADENCE === 0 means the
                      last post rendered its own EventsRail, so two would land
                      back to back with nothing between them. */}
                  {posts.length % EVENTS_RAIL_CADENCE !== 0 ? <EventsRail /> : null}
                </View>
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

const styles = themedStyles(() => ({
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
  caughtUp: {
    alignItems: 'center',
    paddingTop: SPACING[6],
    paddingBottom: SPACING[4],
    gap: SPACING[2],
  },
  caughtUpTitle: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.accent,
  },
  caughtUpBody: {
    // FONTS has no `regular` — the lightest weight in the ramp is `medium`.
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.inkLabel,
    textAlign: 'center',
    marginBottom: SPACING[2],
  },
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
}));
