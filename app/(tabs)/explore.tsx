import { useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useExploreFeed } from '@/hooks/useExploreFeed';
import { useExploreWraps } from '@/hooks/useExploreWraps';
import { useSelectedEventSheet } from '@/hooks/useSelectedEventSheet';
import ExploreEventCard from '@/components/events/ExploreEventCard';
import WrapCard from '@/components/wrap/WrapCard';
import WrapEntryCard from '@/components/wrap/WrapEntryCard';
import EventBottomSheet, {
  EventBottomSheetRef,
} from '@/components/events/EventBottomSheet';
import CreateEventFab from '@/components/CreateEventFab';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { ExploreEvent, ExploreWrap } from '@/types/models';
import { Icon, Button } from '@/components/ui';

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
  const sheetRef = useRef<EventBottomSheetRef>(null);
  useSelectedEventSheet(sheetRef);

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

  const openEvent = (id: string) => sheetRef.current?.open(id);

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
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Explore</Text>
        </View>

        {explore.isLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 48 }} />
        ) : (
          <FlatList
            data={feed}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.list}
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
                  style={{ marginVertical: 16 }}
                />
              ) : null
            }
            ListEmptyComponent={
              explore.isError ? (
                <View style={styles.empty}>
                  <View style={styles.emptyIcon}>
                    <Icon name="close" size={36} color={COLORS.primary} />
                  </View>
                  <Text style={styles.emptyTitle}>Couldn't load the feed</Text>
                  <Text style={styles.emptyText}>
                    {(explore.error as any)?.message ?? String(explore.error)}
                  </Text>
                  <Button
                    label="Retry"
                    height={44}
                    onPress={() => explore.refetch()}
                    style={{ marginTop: 6 }}
                  />
                </View>
              ) : (
                <View style={styles.empty}>
                  <View style={styles.emptyIcon}>
                    <Icon name="pin" size={38} color={COLORS.primary} />
                  </View>
                  <Text style={styles.emptyTitle}>Nothing nearby yet</Text>
                  <Text style={styles.emptyText}>
                    Be the first, drop a pin and get something going.
                  </Text>
                </View>
              )
            }
          />
        )}
      </SafeAreaView>

      <CreateEventFab />

      <EventBottomSheet ref={sheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 22,
    letterSpacing: -0.44,
    color: COLORS.textPrimary,
  },
  list: { padding: 16, paddingTop: 4, gap: 12 },
  empty: { alignItems: 'center', paddingTop: 70, gap: 10 },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontFamily: FONTS.bold, fontSize: 17, color: COLORS.textPrimary },
  emptyText: {
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 240,
  },
});
