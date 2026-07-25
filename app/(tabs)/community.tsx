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
