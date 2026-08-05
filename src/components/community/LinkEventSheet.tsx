import { useMemo } from 'react';
import { View,
  Text,
  FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Sheet, NavButton, Loader, EmptyState } from '@/components/ui';
import { queryKeys } from '@/constants/queryKeys';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { useAuthStore } from '@/stores/authStore';
import { getMyEvents, getJoinedEvents } from '@/services/events.service';
import { splitByWhen } from '@/utils/events';
import { NearbyEvent } from '@/types/models';
import EventRow from '@/components/events/EventRow';
import { themedStyles } from '@/theme';

/**
 * Picks one of your own events to link to a post (migration 070).
 *
 * Scoped to events you host or have joined — the two lists the app already
 * loads for "Your plans" — rather than a search over everything. Linking is a
 * "come to this thing I'm part of" gesture, and posts_insert enforces the same
 * rule server-side, so a wider list here would only surface options the write
 * would then reject.
 *
 * Upcoming only. A past event is not something a reader can act on, and
 * `splitByWhen` is the app's one answer to which side of that line an event
 * falls on (it keys on when an event *ends*, not when it starts).
 */
export function LinkEventSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (event: NearbyEvent) => void;
}) {
  const userId = useAuthStore((s) => s.user?.id);

  const hosting = useQuery({
    queryKey: queryKeys.myEvents.of(userId),
    queryFn: () => getMyEvents(userId!),
    enabled: !!userId && visible,
  });
  const joined = useQuery({
    queryKey: queryKeys.joinedEvents.of(userId),
    queryFn: () => getJoinedEvents(userId!),
    enabled: !!userId && visible,
  });

  // getJoinedEvents already drops events you host (they'd otherwise appear
  // twice since migration 043), so a plain concat needs no dedup.
  const events = useMemo(
    () =>
      splitByWhen([...(hosting.data ?? []), ...(joined.data ?? [])]).upcoming,
    [hosting.data, joined.data]
  );

  const loading = hosting.isLoading || joined.isLoading;

  return (
    <Sheet visible={visible} onClose={onClose} grabber style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Link an event</Text>
        <NavButton icon="close" onPress={onClose} accessibilityLabel="Close" />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <Loader />
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          style={styles.listBox}
          renderItem={({ item }) => (
            <EventRow
              event={item}
              cta="view"
              tone="quiet"
              photo
              onPress={() => {
                Haptics.selectionAsync();
                onPick(item);
              }}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="calendar"
              title="No upcoming events"
              body="Host or join something first, then you can link it to a post."
            />
          }
        />
      )}
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  card: { padding: SPACING[5], gap: SPACING[4] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    color: COLORS.textPrimary,
  },
  loading: { paddingVertical: SPACING[8] },
  // Capped so a long list of plans can't push the sheet past the screen.
  listBox: { maxHeight: 380 },
  list: { gap: SPACING[2.5] },
}));
