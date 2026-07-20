import { useEffect, useMemo, useRef, useState } from 'react';
import { queryKeys } from '@/constants/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSelectedEventSheet } from '@/hooks/useSelectedEventSheet';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import {
  getExploreFeed,
  getJoinedEvents,
  getMyEvents,
} from '@/services/events.service';
import { getUnreadCount } from '@/services/notifications.service';
import { getGreetingLines } from '@/services/greetings.service';
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
import WrapEntryCard from '@/components/wrap/WrapEntryCard';
import {
  Avatar,
  AttendeeStack,
  Icon,
  IconButton,
  PressableScale,
  VerifiedBadge,
} from '@/components/ui';
import EventRow from '@/components/events/EventRow';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const LINE_ROTATE_MS = 18000;
const WAVE_EVERY_MS = 6000;

// 👋 pivots at its wrist and does a little wave, then rests until the next
// cycle. Must be its own Text: transforms don't apply to nested Text spans.
function WavingHand() {
  const tilt = useSharedValue(0);

  useEffect(() => {
    const wiggle = { duration: 130, easing: Easing.inOut(Easing.quad) };
    tilt.value = withRepeat(
      withDelay(
        WAVE_EVERY_MS,
        withSequence(
          withTiming(16, wiggle),
          withTiming(-9, wiggle),
          withTiming(13, wiggle),
          withTiming(-5, wiggle),
          withTiming(0, wiggle)
        )
      ),
      -1
    );
  }, [tilt]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${tilt.value}deg` }],
  }));

  return (
    <Animated.Text style={[styles.wave, style]} allowFontScaling={false}>
      👋
    </Animated.Text>
  );
}

// Rich "Tonight near you" card: photo banner + host + attendees + Join.
function NearbyCard({
  event,
  joined = false,
  onPress,
}: {
  event: ExploreEvent;
  joined?: boolean;
  onPress: () => void;
}) {
  const activity = ACTIVITY_MAP[event.activity];
  return (
    <PressableScale style={styles.nearbyCard} onPress={onPress} scaleTo={0.98}>
      <View style={styles.nearbyMedia}>
        {event.image_url ? (
          <Image
            source={{ uri: event.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <Text style={styles.mediaHint}>EVENT PHOTO</Text>
        )}
        <View style={styles.mediaBadge}>
          <Text style={styles.mediaBadgeEmoji}>{activity?.emoji ?? '📍'}</Text>
        </View>
        {event.distance_m != null && (
          <View style={styles.distanceBadge}>
            <Text style={styles.distanceText}>
              {formatDistance(event.distance_m)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.nearbyBody}>
        <View style={styles.nearbyHostRow}>
          <Avatar name={event.host_name} photoUrl={event.host_photo_url} size={20} />
          <Text style={styles.nearbyHostName} numberOfLines={1}>
            {event.host_name}
          </Text>
          {event.host_verified && <VerifiedBadge size={13} />}
          <Text style={styles.nearbyHostLabel}>is hosting</Text>
        </View>

        <Text style={styles.nearbyTitle} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={styles.nearbyTime}>{formatEventTime(event.starts_at)}</Text>

        <View style={styles.nearbyFooter}>
          <AttendeeStack count={event.participant_count} size={27} />
          <View style={[styles.joinBtn, joined && styles.goingBtn]}>
            <Text style={[styles.joinBtnText, joined && styles.goingBtnText]}>
              {joined ? 'Going' : 'Join'}
            </Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

// Full-width row: category tile + title + meta + Manage/View pill.
// A single hosting event as a rich, full-width card (photo banner + Manage).
function HostingCard({
  event,
  onPress,
}: {
  event: NearbyEvent;
  onPress: () => void;
}) {
  const activity = ACTIVITY_MAP[event.activity];
  return (
    <PressableScale style={styles.hostingCard} onPress={onPress} scaleTo={0.98}>
      <View style={styles.hostingMedia}>
        {event.image_url ? (
          <Image
            source={{ uri: event.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <Text style={styles.mediaHint}>EVENT PHOTO</Text>
        )}
        <View style={styles.mediaBadge}>
          <Text style={styles.mediaBadgeEmoji}>{activity?.emoji ?? '📍'}</Text>
        </View>
        <View style={styles.hostingBadge}>
          <Text style={styles.hostingBadgeText}>You're hosting</Text>
        </View>
      </View>
      <View style={styles.hostingBody}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.nearbyTitle} numberOfLines={1}>
            {event.title}
          </Text>
          <Text style={styles.nearbyTime}>
            {formatEventTime(event.starts_at)}
            {event.participant_count ? ` · ${event.participant_count} going` : ''}
          </Text>
        </View>
        <View style={styles.manageBtn}>
          <Text style={styles.manageBtnText}>Manage</Text>
        </View>
      </View>
    </PressableScale>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showAllHosting, setShowAllHosting] = useState(false);
  const user = useAuthStore((s) => s.user);
  const cityName = useLocationStore((s) => s.cityName);
  const coords = useLocationStore((s) => s.coords);
  const sheetRef = useRef<EventBottomSheetRef>(null);
  useSelectedEventSheet(sheetRef);

  const nearbyQuery = useQuery({
    queryKey: ['dashboardNearby', user?.id, coords?.lat, coords?.lng],
    queryFn: () => getExploreFeed({ userId: user!.id, coords, limit: 10 }),
    enabled: !!user,
  });

  const joinedQuery = useQuery({
    queryKey: queryKeys.joinedEvents.of(user?.id),
    queryFn: () => getJoinedEvents(user!.id),
    enabled: !!user,
  });

  const myEventsQuery = useQuery({
    queryKey: queryKeys.myEvents.of(user?.id),
    queryFn: () => getMyEvents(user!.id),
    enabled: !!user,
  });

  // Kept live by useNotifications, which invalidates this key whenever a
  // notification row arrives over realtime.
  const unreadQuery = useQuery({
    queryKey: queryKeys.notificationsUnread.of(user?.id),
    queryFn: () => getUnreadCount(user!.id),
    enabled: !!user,
  });

  // Quirky header lines from the DB (greeting_lines table); the time-of-day
  // greeting always leads, then the rest cycle in every LINE_ROTATE_MS.
  const linesQuery = useQuery({
    queryKey: ['greetingLines'],
    queryFn: getGreetingLines,
    staleTime: 60 * 60 * 1000,
  });

  const headerLines = useMemo(
    () => [greeting(), ...(linesQuery.data ?? [])],
    [linesQuery.data]
  );
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    if (headerLines.length < 2) return;
    const id = setInterval(
      () => setLineIndex((i) => i + 1),
      LINE_ROTATE_MS
    );
    return () => clearInterval(id);
  }, [headerLines.length]);

  const headerLine = headerLines[lineIndex % headerLines.length];

  // Events you've already RSVP'd to read "Going", not "Join".
  const joinedIds = new Set(joinedQuery.data?.map((e) => e.id) ?? []);

  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const hasJoined = (joinedQuery.data?.length ?? 0) > 0;
  const hasHosting = (myEventsQuery.data?.length ?? 0) > 0;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Animated.Text
                key={headerLine}
                entering={FadeInDown.duration(320)}
                exiting={FadeOutUp.duration(220)}
                style={styles.greeting}
                numberOfLines={1}
              >
                {headerLine}
              </Animated.Text>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {firstName}
                </Text>
                <WavingHand />
              </View>
            </View>
            <IconButton
              icon="bell"
              iconSize={21}
              size={42}
              color="#fff"
              style={styles.headerBtn}
              badge={(unreadQuery.data ?? 0) > 0}
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
            <Icon name="search" size={17} color="rgba(255,255,255,0.55)" />
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

          {/* Post-event wrap prompt (hidden once completed) */}
          <WrapEntryCard />

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
                snapToInterval={285}
                decelerationRate="fast"
              >
                {nearbyQuery.data!.map((event) => (
                  <NearbyCard
                    key={event.id}
                    event={event}
                    joined={joinedIds.has(event.id)}
                    onPress={() => sheetRef.current?.open(event.id)}
                  />
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* You're hosting — one rich card, "See all" expands to a list */}
          {hasHosting && (
            <Animated.View entering={FadeInDown.delay(60).duration(350)}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>You're hosting</Text>
                {myEventsQuery.data!.length > 1 && (
                  <Text
                    style={styles.seeAll}
                    onPress={() => setShowAllHosting((v) => !v)}
                  >
                    {showAllHosting ? 'Show less' : 'See all'}
                  </Text>
                )}
              </View>
              {showAllHosting ? (
                <View style={styles.rowList}>
                  {myEventsQuery.data!.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      cta="manage"
                      elevated
                      onPress={() => router.push(`/events/host/${event.id}`)}
                    />
                  ))}
                </View>
              ) : (
                <HostingCard
                  event={myEventsQuery.data![0]}
                  // Hosts land on the manage panel (attendees, requests, edit).
                  onPress={() =>
                    router.push(`/events/host/${myEventsQuery.data![0].id}`)
                  }
                />
              )}
            </Animated.View>
          )}

          {/* Your upcoming */}
          <Animated.View entering={FadeInDown.delay(90).duration(350)}>
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
                  Explore what's happening and join something nearby.
                </Text>
                <PressableScale
                  scaleTo={0.97}
                  style={styles.exploreBtn}
                  onPress={() => router.push('/(tabs)/explore')}
                >
                  <Text style={styles.exploreBtnText}>Explore events</Text>
                </PressableScale>
              </View>
            ) : (
              <View style={styles.rowList}>
                {joinedQuery.data!.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    cta="view"
                    elevated
                    onPress={() => router.push(`/(tabs)/chats/${event.id}`)}
                  />
                ))}
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </View>
      <CreateEventFab />
      <EventBottomSheet ref={sheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  header: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 18,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBtn: { backgroundColor: 'rgba(255,255,255,0.12)' },
  greeting: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 9,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: {
    fontFamily: FONTS.heading,
    fontSize: 25,
    lineHeight: 26,
    letterSpacing: -0.5,
    color: '#fff',
    flexShrink: 1,
  },
  wave: {
    fontSize: 22,
    lineHeight: 26,
    // Pivot near the wrist so the rotation reads as a wave, not a spin.
    transformOrigin: '75% 100%',
  },
  searchBar: {
    height: 44,
    marginTop: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 100,
  },
  searchText: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.55)',
  },
  scroll: { padding: 20, paddingBottom: 100, gap: 20 },
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
    fontFamily: FONTS.heading,
    fontSize: 17,
    letterSpacing: -0.3,
    color: COLORS.textPrimary,
  },
  seeAll: { fontFamily: FONTS.bold, fontSize: 12.5, color: COLORS.primary },

  // Rich nearby card
  nearbyScroll: { marginHorizontal: -20 },
  nearbyScrollContent: { paddingHorizontal: 20, gap: 13 },
  nearbyCard: {
    width: 272,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  nearbyMedia: {
    height: 120,
    backgroundColor: '#E6E4E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaHint: {
    fontFamily: FONTS.semibold,
    fontSize: 9,
    letterSpacing: 0.5,
    color: COLORS.textMuted,
  },
  mediaBadge: {
    position: 'absolute',
    top: 11,
    left: 11,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  mediaBadgeEmoji: { fontSize: 16 },
  distanceBadge: {
    position: 'absolute',
    top: 11,
    right: 11,
    backgroundColor: 'rgba(23,21,26,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  distanceText: { fontFamily: FONTS.bold, fontSize: 10.5, color: '#fff' },
  nearbyBody: { padding: 14 },
  nearbyHostRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nearbyHostName: {
    fontFamily: FONTS.heavy,
    fontSize: 11.5,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  nearbyHostLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    color: COLORS.textSecondary,
  },
  nearbyTitle: {
    fontFamily: FONTS.heading,
    fontSize: 18,
    lineHeight: 20,
    letterSpacing: -0.4,
    color: COLORS.textPrimary,
    marginTop: 9,
  },
  nearbyTime: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 6,
  },
  nearbyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  attendeeStack: { flexDirection: 'row', alignItems: 'center' },
  attendeeRing: {
    borderRadius: 15,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  attendeeOverflow: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendeeOverflowText: { fontFamily: FONTS.heavy, fontSize: 9.5, color: '#fff' },
  joinBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 10,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  joinBtnText: { fontFamily: FONTS.heading, fontSize: 13, color: '#fff' },
  goingBtn: {
    backgroundColor: COLORS.successTint,
    shadowOpacity: 0,
    elevation: 0,
  },
  goingBtnText: { color: COLORS.success },

  // You're hosting — rich full-width card
  hostingCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  hostingMedia: {
    height: 120,
    backgroundColor: '#E6E4E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostingBadge: {
    position: 'absolute',
    top: 11,
    right: 11,
    backgroundColor: 'rgba(23,21,26,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  hostingBadgeText: { fontFamily: FONTS.bold, fontSize: 10.5, color: '#fff' },
  hostingBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  manageBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  manageBtnText: { fontFamily: FONTS.heavy, fontSize: 11.5, color: COLORS.white },

  // Full-width event row
  rowList: { gap: 10 },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
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
  emptyTitle: { fontFamily: FONTS.heading, fontSize: 15, color: COLORS.textPrimary },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  exploreBtn: {
    marginTop: 14,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
  },
  exploreBtnText: { fontFamily: FONTS.heading, fontSize: 14, color: '#fff' },
});
