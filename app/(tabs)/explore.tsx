import { useMemo, useRef } from 'react';
import { SPACING } from '@/constants/spacing';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useExploreFeed } from '@/hooks/useExploreFeed';
import { useExploreWraps } from '@/hooks/useExploreWraps';
import { useUIStore } from '@/stores/uiStore';
import ExploreEventCard from '@/components/events/ExploreEventCard';
import WrapCard from '@/components/wrap/WrapCard';
import WrapEntryCard from '@/components/wrap/WrapEntryCard';
import CreateEventFab from '@/components/CreateEventFab';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { ExploreEvent, ExploreWrap } from '@/types/models';
import {
  EmptyState,
  Loader,
  Screen,
  useTabBarInset,
} from '@/components/ui';
import { errorMessage } from '@/utils/errors';

// One Instagram-style feed: upcoming events as post cards, with a wrapped
// event's top-6 gallery woven in after every few events.
type FeedItem =
  | { kind: 'event'; key: string; event: ExploreEvent }
  | { kind: 'wrap'; key: string; wrap: ExploreWrap };

const EVENTS_PER_WRAP = 3;

function mergeFeeds(events: ExploreEvent[], wraps: ExploreWrap[]): FeedItem[] {
  const items: FeedItem[] = [];
  let wrapIndex = 0;
  events.forEach((event, i) => {
    items.push({ kind: 'event', key: `event-${event.id}`, event });
    if ((i + 1) % EVENTS_PER_WRAP === 0 && wrapIndex < wraps.length) {
      const wrap = wraps[wrapIndex++];
      items.push({ kind: 'wrap', key: `wrap-${wrap.event_id}`, wrap });
    }
  });
  // No events left but wraps remain: let them close out the feed.
  while (wrapIndex < wraps.length && events.length > 0) {
    const wrap = wraps[wrapIndex++];
    items.push({ kind: 'wrap', key: `wrap-${wrap.event_id}`, wrap });
  }
  return items;
}

export default function ExploreScreen() {
  const tabBarInset = useTabBarInset();

  const explore = useExploreFeed();
  const wrapsQuery = useExploreWraps();

  const events = useMemo(
    () => explore.data?.pages.flat() ?? [],
    [explore.data]
  );
  const wraps = useMemo(
    () => wrapsQuery.data?.pages.flat() ?? [],
    [wrapsQuery.data]
  );
  const feed = useMemo(() => mergeFeeds(events, wraps), [events, wraps]);

  const openEvent = (id: string) => useUIStore.getState().setSelectedEvent(id);

  function loadMore() {
    if (explore.hasNextPage && !explore.isFetchingNextPage) {
      explore.fetchNextPage();
    }
    // Keep the wrap supply ahead of the interleave ratio.
    const wrapsNeeded = Math.ceil(events.length / EVENTS_PER_WRAP);
    if (
      wraps.length <= wrapsNeeded &&
      wrapsQuery.hasNextPage &&
      !wrapsQuery.isFetchingNextPage
    ) {
      wrapsQuery.fetchNextPage();
    }
  }

  return (
    <View style={styles.root}>
      <Screen background="transparent">
        <View style={styles.header}>
          <Text style={styles.title}>Explore</Text>
        </View>

        {explore.isLoading ? (
          <Loader />
        ) : (
          <FlatList
            data={feed}
            keyExtractor={(item) => item.key}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: tabBarInset },
            ]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={<WrapEntryCard />}
            renderItem={({ item, index }) => (
              <Animated.View
                entering={FadeInDown.delay(Math.min(index, 6) * 60).duration(350)}
              >
                {item.kind === 'event' ? (
                  <ExploreEventCard
                    event={item.event}
                    onPress={() => openEvent(item.event.id)}
                  />
                ) : (
                  <WrapCard wrap={item.wrap} />
                )}
              </Animated.View>
            )}
            refreshControl={
              <RefreshControl
                refreshing={explore.isRefetching && !explore.isFetchingNextPage}
                onRefresh={() => {
                  explore.refetch();
                  wrapsQuery.refetch();
                }}
                tintColor={COLORS.primary}
              />
            }
            onEndReachedThreshold={0.5}
            onEndReached={loadMore}
            ListFooterComponent={
              explore.isFetchingNextPage ? (
                <ActivityIndicator
                  color={COLORS.primary}
                  style={{ marginVertical: SPACING[4] }}
                />
              ) : null
            }
            ListEmptyComponent={
              explore.isError ? (
                <EmptyState
                  icon="close"
                  title="Couldn't load the feed"
                  body={errorMessage(explore.error)}
                  actionLabel="Retry"
                  onAction={() => explore.refetch()}
                />
              ) : (
                <EmptyState
                  icon="pin"
                  title="Nothing nearby yet"
                  body="Be the first, drop a pin and get something going."
                />
              )
            }
          />
        )}
      </Screen>

      <CreateEventFab />
    </View>
  );
}

const styles = StyleSheet.create({
  // Transparent, not COLORS.background: <AppBackground> is mounted behind the
  // tab navigator and this would paint over it.
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
