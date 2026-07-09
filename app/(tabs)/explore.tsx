import { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useExploreFeed } from '@/hooks/useExploreFeed';
import { useUIStore } from '@/stores/uiStore';
import ExploreEventCard from '@/components/events/ExploreEventCard';
import EventBottomSheet, {
  EventBottomSheetRef,
} from '@/components/events/EventBottomSheet';
import CreateEventFab from '@/components/CreateEventFab';
import { ACTIVITIES } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { ActivityId, ExploreEvent } from '@/types/models';
import { Icon, IconName, Button, PressableScale } from '@/components/ui';

export default function ExploreScreen() {
  const { activeFilter, setFilter } = useUIStore();
  const sheetRef = useRef<EventBottomSheetRef>(null);

  const {
    data,
    isLoading,
    isError,
    error,
    isRefetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useExploreFeed();

  const events = data?.pages.flat() ?? [];

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Explore</Text>
        </View>

        {/* Activity filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          style={styles.filterBar}
        >
          <PressableScale
            scaleTo={0.93}
            style={[styles.filterChip, !activeFilter && styles.allChipActive]}
            onPress={() => setFilter(null)}
          >
            <Text
              style={[styles.filterText, !activeFilter && styles.allTextActive]}
            >
              All
            </Text>
          </PressableScale>
          {ACTIVITIES.map((a) => {
            const active = activeFilter === a.id;
            const cat = categoryStyle(a.id);
            return (
              <PressableScale
                key={a.id}
                scaleTo={0.93}
                style={[
                  styles.filterChip,
                  active && { backgroundColor: cat.tint },
                ]}
                onPress={() => setFilter(active ? null : (a.id as ActivityId))}
              >
                <Icon
                  name={a.id as IconName}
                  size={14}
                  color={active ? cat.accent : cat.accent}
                />
                <Text
                  style={[styles.filterText, active && { color: cat.accent }]}
                >
                  {a.label}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        {/* Feed */}
        {isLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 48 }} />
        ) : (
          <FlatList
            data={events}
            keyExtractor={(item: ExploreEvent) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <Animated.View
                entering={FadeInDown.delay(Math.min(index, 6) * 60).duration(
                  350
                )}
              >
                <ExploreEventCard
                  event={item}
                  onPress={() => sheetRef.current?.open(item.id)}
                />
              </Animated.View>
            )}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching && !isFetchingNextPage}
                onRefresh={refetch}
                tintColor={COLORS.primary}
              />
            }
            onEndReachedThreshold={0.5}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage();
            }}
            ListFooterComponent={
              isFetchingNextPage ? (
                <ActivityIndicator
                  color={COLORS.primary}
                  style={{ marginVertical: 16 }}
                />
              ) : null
            }
            ListEmptyComponent={
              isError ? (
                <View style={styles.empty}>
                  <View style={styles.emptyIcon}>
                    <Icon name="close" size={36} color={COLORS.primary} />
                  </View>
                  <Text style={styles.emptyTitle}>Couldn't load the feed</Text>
                  <Text style={styles.emptyText}>
                    {(error as any)?.message ?? String(error)}
                  </Text>
                  <Button
                    label="Retry"
                    height={44}
                    onPress={() => refetch()}
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
                    Be the first — drop a pin and get something going.
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
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 2 },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 22,
    letterSpacing: -0.44,
    color: COLORS.textPrimary,
  },
  filterBar: { maxHeight: 52, flexGrow: 0 },
  filters: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 7,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 33,
    gap: 6,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 13,
    borderRadius: 100,
  },
  allChipActive: {
    backgroundColor: COLORS.primary,
  },
  filterText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.textPrimary,
  },
  allTextActive: { color: '#fff' },
  list: { padding: 16, paddingTop: 6, gap: 12 },
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
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 240,
  },
});
