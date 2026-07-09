import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import {
  getExploreFeed,
  getJoinedEvents,
  getMyEvents,
} from '@/services/events.service';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { ACTIVITY_MAP } from '@/constants/activities';
import { ExploreEvent, NearbyEvent } from '@/types/models';
import { formatEventTime } from '@/utils/time';
import { formatDistance } from '@/utils/distance';
import CreateEventFab from '@/components/CreateEventFab';
import EventBottomSheet, {
  EventBottomSheetRef,
} from '@/components/events/EventBottomSheet';
import {
  Avatar,
  CategoryTile,
  Icon,
  IconButton,
  PressableScale,
  SectionLabel,
  VerifiedBadge,
} from '@/components/ui';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function NearbyCard({
  event,
  onPress,
}: {
  event: ExploreEvent;
  onPress: () => void;
}) {
  const activity = ACTIVITY_MAP[event.activity];
  return (
    <PressableScale style={styles.nearbyCard} onPress={onPress} scaleTo={0.97}>
      <View style={styles.nearbyTop}>
        <CategoryTile activity={event.activity} size={36} radius={11} />
        <Text style={styles.nearbyCat} numberOfLines={1}>
          {activity.label}
        </Text>
        {event.distance_m != null && (
          <Text style={styles.nearbyDistance}>
            {formatDistance(event.distance_m)}
          </Text>
        )}
      </View>

      <Text style={styles.nearbyTitle} numberOfLines={1}>
        {event.title}
      </Text>

      <View style={styles.nearbyHostRow}>
        <Avatar
          name={event.host_name}
          photoUrl={event.host_photo_url}
          size={20}
        />
        <Text style={styles.nearbyHost} numberOfLines={1}>
          {event.host_name} · host
        </Text>
        <VerifiedBadge size={13} />
      </View>

      <View style={styles.nearbyFooter}>
        <View style={styles.attendeeStack}>
          {Array.from({
            length: Math.min(event.participant_count, 3),
          }).map((_, i) => (
            <View
              key={i}
              style={[styles.attendeeRing, i > 0 && { marginLeft: -8 }]}
            >
              <Avatar name={String.fromCharCode(65 + i)} size={24} />
            </View>
          ))}
          {event.participant_count > 3 && (
            <View
              style={[
                styles.attendeeRing,
                styles.attendeeOverflow,
                { marginLeft: -8 },
              ]}
            >
              <Text style={styles.attendeeOverflowText}>
                +{event.participant_count - 3}
              </Text>
            </View>
          )}
        </View>
        {event.friends_count > 0 ? (
          <View style={styles.goingPill}>
            <Text style={styles.goingPillText}>
              {event.friends_count}{' '}
              {event.friends_count === 1 ? 'friend' : 'friends'}
            </Text>
          </View>
        ) : (
          <Text style={styles.nearbyGoingText}>
            {event.participant_count} going
          </Text>
        )}
      </View>
    </PressableScale>
  );
}

function UpcomingCard({
  event,
  badge,
  onPress,
}: {
  event: NearbyEvent;
  badge: 'going' | 'hosting';
  onPress: () => void;
}) {
  return (
    <PressableScale style={styles.nearbyCard} onPress={onPress} scaleTo={0.97}>
      <View style={styles.nearbyTop}>
        <CategoryTile activity={event.activity} size={36} radius={11} />
        <View style={{ flex: 1 }} />
        {badge === 'going' ? (
          <View style={styles.goingPill}>
            <Text style={styles.goingPillText}>Going</Text>
          </View>
        ) : (
          <View style={[styles.goingPill, styles.hostPill]}>
            <Text style={[styles.goingPillText, styles.hostPillText]}>
              Hosting
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.nearbyTitle} numberOfLines={1}>
        {event.title}
      </Text>
      <Text style={styles.rowMeta} numberOfLines={1}>
        {formatEventTime(event.starts_at)}
        {event.location_name ? ` · ${event.location_name}` : ''}
        {event.distance_m != null
          ? ` · ${formatDistance(event.distance_m)}`
          : ''}
      </Text>
    </PressableScale>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const cityName = useLocationStore((s) => s.cityName);
  const coords = useLocationStore((s) => s.coords);
  const sheetRef = useRef<EventBottomSheetRef>(null);

  const nearbyQuery = useQuery({
    queryKey: ['dashboardNearby', user?.id, coords?.lat, coords?.lng],
    queryFn: () =>
      getExploreFeed({ userId: user!.id, coords, limit: 10 }),
    enabled: !!user,
  });

  const joinedQuery = useQuery({
    queryKey: ['joinedEvents', user?.id],
    queryFn: () => getJoinedEvents(user!.id),
    enabled: !!user,
  });

  const myEventsQuery = useQuery({
    queryKey: ['myEvents', user?.id],
    queryFn: () => getMyEvents(user!.id),
    enabled: !!user,
  });

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const hasJoined = (joinedQuery.data?.length ?? 0) > 0;
  const hasHosting = (myEventsQuery.data?.length ?? 0) > 0;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>{greeting()}</Text>
              <Text style={styles.name}>{firstName}</Text>
            </View>
            <IconButton
              icon="bell"
              iconSize={21}
              size={42}
              badge
              onPress={() => router.push('/notifications')}
              accessibilityLabel="Notifications"
            />
            <PressableScale
              scaleTo={0.92}
              onPress={() => router.push('/(tabs)/profile')}
            >
              <Avatar name={user?.name} photoUrl={user?.photo_url} size={42} />
            </PressableScale>
          </View>

          {/* Search events & people */}
          <PressableScale
            scaleTo={0.98}
            style={styles.searchBar}
            onPress={() => router.push('/search')}
          >
            <Icon name="search" size={17} color="rgba(15,24,44,0.45)" />
            <Text style={styles.searchText}>Search events & people</Text>
          </PressableScale>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {cityName ? (
            <Animated.View
              entering={FadeInDown.duration(350)}
              style={styles.cityRow}
            >
              <Icon name="location" size={14} color={COLORS.primary} />
              <Text style={styles.cityText}>{cityName}</Text>
            </Animated.View>
          ) : null}

          {/* Tonight near you */}
          {(nearbyQuery.data?.length ?? 0) > 0 && (
            <Animated.View entering={FadeInDown.delay(30).duration(350)}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Tonight near you</Text>
                <Text
                  style={styles.seeAll}
                  onPress={() => router.push('/(tabs)/explore')}
                >
                  See all
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.nearbyScroll}
                contentContainerStyle={styles.nearbyScrollContent}
                snapToInterval={252}
                decelerationRate="fast"
              >
                {nearbyQuery.data!.map((event) => (
                  <NearbyCard
                    key={event.id}
                    event={event}
                    onPress={() => sheetRef.current?.open(event.id)}
                  />
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* Your upcoming */}
          <Animated.View entering={FadeInDown.delay(60).duration(350)}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your upcoming</Text>
              <Text
                style={styles.seeAll}
                onPress={() => router.push('/(tabs)/explore')}
              >
                See all
              </Text>
            </View>
            {joinedQuery.isLoading ? (
              <Text style={styles.emptyText}>Loading…</Text>
            ) : !hasJoined ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Icon name="calendar" size={26} color={COLORS.primary} />
                </View>
                <Text style={styles.emptyTitle}>No plans yet</Text>
                <Text style={styles.emptyText}>
                  Explore the map and join something nearby.
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.nearbyScroll}
                contentContainerStyle={styles.nearbyScrollContent}
                snapToInterval={252}
                decelerationRate="fast"
              >
                {joinedQuery.data!.map((event) => (
                  <UpcomingCard
                    key={event.id}
                    event={event}
                    badge="going"
                    onPress={() => router.push(`/(tabs)/chats/${event.id}`)}
                  />
                ))}
              </ScrollView>
            )}
          </Animated.View>

          {/* Hosting */}
          {hasHosting && (
            <Animated.View entering={FadeInDown.delay(120).duration(350)}>
              <SectionLabel style={styles.sectionLabel}>
                You're hosting
              </SectionLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.nearbyScroll}
                contentContainerStyle={styles.nearbyScrollContent}
                snapToInterval={252}
                decelerationRate="fast"
              >
                {myEventsQuery.data!.map((event) => (
                  <UpcomingCard
                    key={event.id}
                    event={event}
                    badge="hosting"
                    onPress={() => router.push(`/(tabs)/chats/${event.id}`)}
                  />
                ))}
              </ScrollView>
            </Animated.View>
          )}
        </ScrollView>
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
    backgroundColor: COLORS.surface,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#0F182C',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greeting: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: 'rgba(15,24,44,0.45)',
  },
  name: {
    fontFamily: FONTS.heavy,
    fontSize: 21,
    letterSpacing: -0.42,
    color: COLORS.textPrimary,
  },
  searchBar: {
    height: 44,
    marginTop: 14,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.background,
    borderRadius: 100,
  },
  searchText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: 'rgba(15,24,44,0.45)',
  },
  scroll: { padding: 20, paddingBottom: 90, gap: 20 },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: -6,
  },
  cityText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  sectionLabel: { marginBottom: 10 },
  seeAll: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.primary,
  },
  nearbyScroll: { marginHorizontal: -20 },
  nearbyScrollContent: { paddingHorizontal: 20, gap: 12 },
  nearbyCard: {
    width: 240,
    gap: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.07)',
    borderRadius: 18,
    padding: 15,
    shadowColor: '#0F182C',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  nearbyTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  nearbyCat: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: 'rgba(15,24,44,0.6)',
  },
  nearbyDistance: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    color: 'rgba(15,24,44,0.4)',
  },
  nearbyTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 16,
    letterSpacing: -0.2,
    color: COLORS.textPrimary,
  },
  nearbyHostRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nearbyHost: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: 'rgba(15,24,44,0.6)',
    flexShrink: 1,
  },
  nearbyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  attendeeStack: { flexDirection: 'row', alignItems: 'center' },
  attendeeRing: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  attendeeOverflow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendeeOverflowText: {
    fontFamily: FONTS.heavy,
    fontSize: 10,
    color: COLORS.primary,
  },
  nearbyGoingText: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    color: 'rgba(15,24,44,0.5)',
  },
  rowMeta: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: 'rgba(15,24,44,0.5)',
    marginTop: 2,
  },
  goingPill: {
    backgroundColor: 'rgba(31,164,99,0.10)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 100,
  },
  goingPillText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.success,
  },
  hostPill: { backgroundColor: COLORS.primaryTint },
  hostPillText: { color: COLORS.primary },
  emptyCard: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.07)',
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
