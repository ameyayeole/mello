import { useEffect, useMemo, useRef, useState } from 'react';
import { RADIUS, SHADOWS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import { useQuery } from '@tanstack/react-query';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
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
import { useUIStore } from '@/stores/uiStore';
import { useSavedEventIds, useSaveEvent } from '@/hooks/useSwipeDeck';
import { useAuthStore } from '@/stores/authStore';
import {
  useHandedOver,
  useOpenOverlay,
  useOverlayRecede,
} from '@/hooks/useOverlayScreen';
import { useLocationStore } from '@/stores/locationStore';
import {
  getExploreFeed,
  getJoinedEvents,
  getAttendeePreviews,
  getMyParticipation,
  getMyEvents,
} from '@/services/events.service';
import type { AttendeePreview } from '@/services/events.service';
import { getUnreadCount } from '@/services/notifications.service';
import { getGreetingLines } from '@/services/greetings.service';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { ACTIVITY_MAP } from '@/constants/activities';
import { ExploreEvent, NearbyEvent, ParticipantStatus } from '@/types/models';
import { formatEventWhen } from '@/utils/time';
import { featuredHostedEvent } from '@/utils/events';
import { hasWrapped } from '@/services/wrap.service';
import { formatDistance } from '@/utils/distance';
import { shareEvent } from '@/utils/shareEvent';
import WrapEntryCard from '@/components/wrap/WrapEntryCard';
import {
  Avatar,
  AttendeeStack,
  Glass,
  Icon,
  PressableScale,
  SectionLabel,
  Sheet,
  useTabBarInset,
  VerifiedBadge,
} from '@/components/ui';
import EventRow from '@/components/events/EventRow';
import FeaturedPlanCard from '@/components/events/FeaturedPlanCard';

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

// Much wider and shorter than the mockup's 206×298. Width is the lever that
// actually buys the photo room: it gives the title enough line length to stay
// on one line, which is what keeps the caption band short, which is what leaves
// the image as the thing you look at.
const CARD_WIDTH = 280;
// Taller than it was: the caption is a fixed height driven by its contents, so
// height is what the *photo* gets. 262 → 300 is all image.
const CARD_HEIGHT = 300;

// No CAPTION_HEIGHT constant on purpose. An earlier version fixed the band's
// height so its top edge landed identically on every card — but a one-line
// title then left ~80pt of empty frosted space above the host row, which is
// the opposite of the caption sitting cushioned at the bottom.
//
// Instead the frost is an absolutely-filled child *of* the caption block, so it
// takes exactly the caption's own height whatever the title does. No measuring
// pass, no first-frame flicker: the layout engine already knows the answer.

/**
 * "Tonight near you" — a full-bleed photo with everything floating on it.
 *
 * The scrim under the caption is the load-bearing part: white text on an
 * arbitrary user photo is illegible about a third of the time. It is a single
 * frosted band with a hard top edge, plus a gradient inside it for contrast.
 *
 * DESIGN.md §3 specifies a *masked* blur that fades in down the image. This is
 * deliberately not that. A frosted panel with a straight edge reads as a
 * deliberate surface — the same pane of glass the search bar and the plan rows
 * are made of — where a fade reads as an effect applied to the photo. It is
 * also one native blur view per card instead of several, which matters on a row
 * that renders all of its children.
 */
function NearbyCard({
  event,
  status,
  preview,
  saved,
  onToggleSave,
  onPress,
}: {
  event: ExploreEvent;
  // My participation, or undefined if I have not asked to join. `pending` is a
  // request awaiting the host — the card must say so rather than offering Join
  // a second time.
  status?: ParticipantStatus;
  // Faces and the true count. Undefined until the RPC lands (or if migration
  // 038 hasn't been run), in which case the card falls back to the feed's own
  // count and draws no faces.
  preview?: AttendeePreview;
  saved: boolean;
  onToggleSave: () => void;
  onPress: () => void;
}) {
  const activity = ACTIVITY_MAP[event.activity];
  const joined = status === 'approved';
  const requested = status === 'pending';
  const label = joined ? 'Going' : requested ? 'Requested' : 'Join';

  return (
    <PressableScale style={styles.nearbyCard} onPress={onPress} scaleTo={0.98}>
      {event.image_url && (
        <Image
          source={{ uri: event.image_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
        />
      )}


      {/* Activity and distance share one pill: they answer the same question,
          "is this worth crossing town for", and two pills on a photo is one
          more thing between you and the picture. */}
      {event.distance_m != null && (
        <Glass tier="onPhoto" radius={RADIUS.full} style={styles.metaPill}>
          <Text style={styles.metaText}>
            {activity?.emoji ?? '📍'} {formatDistance(event.distance_m)}
          </Text>
        </Glass>
      )}

      <PressableScale
        scaleTo={0.86}
        onPress={onToggleSave}
        hitSlop={8}
        style={styles.saveBtn}
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      >
        <Glass tier="onPhoto" radius={17} style={styles.saveBtnGlass}>
          <Icon
            name={saved ? 'bookmarkFilled' : 'bookmark'}
            size={16}
            color={saved ? COLORS.primary : COLORS.white}
            strokeWidth={2}
          />
        </Glass>
      </PressableScale>

      <View style={styles.nearbyBody}>
        {/* Both fill the caption block exactly, and both sit before the text so
            the text paints over them. The gradient goes *inside* the frost
            rather than over the whole card: extending it above the band would
            put a second, soft edge over the hard one. */}
        <BlurView
          tint="dark"
          intensity={34}
          style={StyleSheet.absoluteFill}
        />
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="nearbyScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={COLORS.ink} stopOpacity={0.36} />
              <Stop offset="100%" stopColor={COLORS.ink} stopOpacity={0.74} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#nearbyScrim)" />
        </Svg>

        <View style={styles.nearbyHostRow}>
          <Avatar
            name={event.host_name}
            photoUrl={event.host_photo_url}
            size={20}
            ringColor={COLORS.white}
            ringWidth={1.5}
          />
          <Text style={styles.nearbyHostName} numberOfLines={1}>
            {event.host_name}
          </Text>
          {event.host_verified && <VerifiedBadge size={12} />}
          <Text style={styles.nearbyHostLabel} numberOfLines={1}>
            is hosting
          </Text>
          {/* Pushes the stack to the right edge of the row. */}
          <View style={styles.rowSpacer} />
          {/* `emptyLabel` off: "Be the first to join" is too long to share a
              line with the host's name, and an empty right edge next to a Join
              button already says the same thing. */}
          <AttendeeStack
            people={preview?.attendees}
            count={preview?.going_count ?? event.participant_count}
            size={22}
            emptyLabel={null}
          />
        </View>

        <Text style={styles.nearbyTitle} numberOfLines={2}>
          {event.title}
        </Text>

        <View style={styles.nearbyFooter}>
          {/* Takes the slack, so the button sizes to its label instead of
              stretching across whatever is left. */}
          <View style={styles.footerFill}>
            <Text style={styles.nearbyTime} numberOfLines={1}>
              {formatEventWhen(event.starts_at)}
            </Text>
          </View>
          {/* Three states, three colours: coral is an offer, green is settled,
              neutral is waiting on someone else. Coral only while Join is
              actually on offer — a coral chip that does nothing is a worse lie
              than a quiet one. */}
          <View
            style={[
              styles.joinBtn,
              requested && styles.requestedBtn,
              joined && styles.goingBtn,
            ]}
          >
            <Text style={styles.joinBtnText}>{label}</Text>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

// One plan, hosted or joined, as it appears in "Your plans".
type Plan = { event: NearbyEvent; hosting: boolean };

// How many attending rows sit under the featured card before "See all" takes
// over. The hosted hero is separate and always shows.
const ATTENDING_PREVIEW_COUNT = 2;

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const user = useAuthStore((s) => s.user);
  const cityName = useLocationStore((s) => s.cityName);
  const coords = useLocationStore((s) => s.coords);

  const openOverlay = useOpenOverlay();
  const handedOver = useHandedOver();
  const recedeStyle = useOverlayRecede();
  const bellRef = useRef<View>(null);
  const searchRef = useRef<View>(null);

  const savedIdsQuery = useSavedEventIds();
  const saveEvent = useSaveEvent();

  const nearbyQuery = useQuery({
    queryKey: queryKeys.dashboardNearby.of(user?.id, coords?.lat, coords?.lng),
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

  // The event that gets the hero slot. NOT `data[0]`: getMyEvents is
  // start-ascending and filters only on `is_active`, so the first row is the
  // *oldest* event you ever hosted — which had this card announcing "You're
  // hosting" over something that finished days ago. `featuredHostedEvent` takes
  // the soonest one still to come, falling back to the most recently finished
  // so the wrap stays reachable when you have nothing booked.
  const featuredEvent = featuredHostedEvent(myEventsQuery.data ?? []);
  const featuredEnded = !!featuredEvent && hasWrapped(featuredEvent);

  // Drives the Join / Requested / Going label. Separate from `joinedQuery`
  // because that one is approved-only — see getMyParticipation.
  const participationQuery = useQuery({
    queryKey: queryKeys.myParticipation.of(user?.id),
    queryFn: () => getMyParticipation(user!.id),
    enabled: !!user,
  });

  // Who's going to the events in the nearby row, plus the featured hosted event
  // — its own participant_count includes pending requests, so we want the RPC's
  // approved-only going_count and faces for the hero card. A second round trip
  // rather than part of the feed, because the feed reads participants through
  // RLS and therefore cannot see them — see migration 038.
  const previewIds = useMemo(() => {
    const ids = (nearbyQuery.data ?? []).map((e) => e.id);
    if (featuredEvent) ids.push(featuredEvent.id);
    return ids;
  }, [nearbyQuery.data, featuredEvent]);
  const previewsQuery = useQuery({
    queryKey: queryKeys.attendeePreviews.of(previewIds),
    queryFn: () => getAttendeePreviews(previewIds),
    enabled: previewIds.length > 0,
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

  // Pull to refresh. The dashboard's own feeds are separate cache entries from
  // the map's, so a change made elsewhere in the app (blocking someone, say)
  // can land here later than it lands there — this is the manual escape hatch.
  const refreshing =
    nearbyQuery.isRefetching ||
    joinedQuery.isRefetching ||
    myEventsQuery.isRefetching;

  function handleRefresh() {
    nearbyQuery.refetch();
    joinedQuery.refetch();
    myEventsQuery.refetch();
    unreadQuery.refetch();
  }

  const headerLines = useMemo(
    () => [greeting(), ...(linesQuery.data ?? [])],
    [linesQuery.data]
  );
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    if (headerLines.length < 2) return;
    const id = setInterval(() => setLineIndex((i) => i + 1), LINE_ROTATE_MS);
    return () => clearInterval(id);
  }, [headerLines.length]);

  const headerLine = headerLines[lineIndex % headerLines.length];

  const participation = participationQuery.data ?? {};
  const savedIds = new Set(savedIdsQuery.data ?? []);

  // Hosting and attending are one list, because that is how a day works: what
  // matters is what's next, not which side of it you're on. The eyebrow on each
  // row carries the distinction the two separate headings used to. Hosting
  // always sorts first — it's the plan you can't bail on, so it should never
  // be bumped down the list by something you're merely attending.
  const plans = useMemo<Plan[]>(() => {
    const hosted: Plan[] = (myEventsQuery.data ?? []).map((event) => ({
      event,
      hosting: true,
    }));
    const joined: Plan[] = (joinedQuery.data ?? []).map((event) => ({
      event,
      hosting: false,
    }));
    return [...hosted, ...joined].sort((a, b) => {
      if (a.hosting !== b.hosting) return a.hosting ? -1 : 1;
      return (
        new Date(a.event.starts_at).getTime() -
        new Date(b.event.starts_at).getTime()
      );
    });
  }, [myEventsQuery.data, joinedQuery.data]);

  // The hero (featuredEvent) is pulled out of the row list; the rows beneath it
  // are the ones you're attending. Any extra hosted events live in "See all".
  const attendingPreview = useMemo(
    () => plans.filter((p) => !p.hosting).slice(0, ATTENDING_PREVIEW_COUNT),
    [plans]
  );
  const shownCount = (featuredEvent ? 1 : 0) + attendingPreview.length;
  const hasMorePlans = plans.length > shownCount;
  const [plansSheetVisible, setPlansSheetVisible] = useState(false);

  const plansLoading = myEventsQuery.isLoading || joinedQuery.isLoading;
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <View style={styles.root}>
      {/* Dark glyphs: the backdrop is light on every screen now. */}
      <StatusBar style="dark" />

      <Animated.View style={[styles.fill, recedeStyle]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + SPACING[3], paddingBottom: tabBarInset },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Header — no chrome behind it. The greeting sits directly on the
            backdrop, so the first thing on screen is the background itself. */}
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
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

          {/* `collapsable={false}` so Android keeps the view around to be
              measured — a plain wrapper with no styling is exactly what view
              flattening removes. The ref goes here rather than on
              PressableScale because that one is an animated component, whose
              host ref is not something to rely on. */}
          <View
            ref={bellRef}
            collapsable={false}
            style={handedOver === 'notifications' && styles.handedOver}
          >
            <PressableScale
              scaleTo={0.9}
              onPress={() => openOverlay('notifications', bellRef)}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Glass tier="panel" radius={23} style={styles.headerBtn}>
                <Icon name="bell" size={20} color={COLORS.textPrimary} />
                {(unreadQuery.data ?? 0) > 0 && (
                  <View style={styles.headerDot} />
                )}
              </Glass>
            </PressableScale>
          </View>

          <PressableScale
            scaleTo={0.92}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Avatar name={user?.name} photoUrl={user?.photo_url} size={46} />
          </PressableScale>
        </View>

        {/* Handed to the search screen the same way the chip above is handed
            to notifications — it flies up to the top and narrows to make room
            for the close button. Same wrapper, same reason. */}
        <View
          ref={searchRef}
          collapsable={false}
          style={handedOver === 'search' && styles.handedOver}
        >
          <PressableScale
            scaleTo={0.98}
            onPress={() => openOverlay('search', searchRef)}
          >
            <Glass tier="panel" radius={RADIUS.lg} style={styles.searchBar}>
              <Icon name="search" size={18} color={COLORS.textMuted} />
              <Text style={styles.searchText}>Search events & people</Text>
            </Glass>
          </PressableScale>
        </View>

        {cityName ? (
          <Animated.View
            entering={FadeInDown.duration(350)}
            style={styles.cityRow}
          >
            <Icon name="location" size={15} color={COLORS.primary} />
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
              snapToInterval={CARD_WIDTH + SPACING[3.5]}
              decelerationRate="fast"
            >
              {nearbyQuery.data!.map((event) => (
                <NearbyCard
                  key={event.id}
                  event={event}
                  status={participation[event.id]}
                  preview={previewsQuery.data?.[event.id]}
                  saved={savedIds.has(event.id)}
                  onToggleSave={() =>
                    saveEvent.mutate({
                      eventId: event.id,
                      save: !savedIds.has(event.id),
                    })
                  }
                  onPress={() => useUIStore.getState().setSelectedEvent(event.id)}
                />
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Your plans — hosting and attending in one list, soonest first */}
        <Animated.View entering={FadeInDown.delay(60).duration(350)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your plans</Text>
            {hasMorePlans && (
              <Text
                style={styles.seeAll}
                onPress={() => setPlansSheetVisible(true)}
              >
                See all
              </Text>
            )}
          </View>

          {plansLoading ? (
            <Text style={styles.emptyText}>Loading…</Text>
          ) : plans.length === 0 ? (
            <Glass tier="panel" radius={RADIUS.xl} style={styles.emptyCard}>
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
            </Glass>
          ) : (
            <View style={styles.rowList}>
              {/* Your hosting hero: the next one, or the last one so its wrap
                  stays reachable. */}
              {featuredEvent && (
                <FeaturedPlanCard
                  event={featuredEvent}
                  preview={previewsQuery.data?.[featuredEvent.id]}
                  ended={featuredEnded}
                  onManage={() =>
                    router.push(
                      featuredEnded
                        ? `/events/wrap/${featuredEvent.id}`
                        : `/events/host/${featuredEvent.id}`
                    )
                  }
                  onShare={() => shareEvent(featuredEvent)}
                  onChat={() =>
                    router.push(`/(tabs)/chats/${featuredEvent.id}`)
                  }
                />
              )}

              {attendingPreview.length > 0 && (
                <>
                  {/* Only a heading once the hero is above it — with no hero
                      these rows are the whole section and speak for themselves. */}
                  {featuredEvent && (
                    <SectionLabel style={styles.alsoLabel}>
                      Also attending
                    </SectionLabel>
                  )}
                  {attendingPreview.map(({ event }) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      glass
                      photo
                      eyebrow="attending"
                      cta="details"
                      tone="quiet"
                      onPress={() => router.push(`/(tabs)/chats/${event.id}`)}
                    />
                  ))}
                </>
              )}
            </View>
          )}
        </Animated.View>
      </ScrollView>
      </Animated.View>

      <Sheet
        visible={plansSheetVisible}
        onClose={() => setPlansSheetVisible(false)}
        grabber
        style={styles.plansSheetCard}
      >
        <Text style={styles.plansSheetTitle}>Your plans</Text>
        <ScrollView
          style={styles.plansSheetScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.rowList}>
            {plans.map(({ event, hosting }) => (
              <EventRow
                key={event.id}
                event={event}
                glass
                photo
                eyebrow={hosting ? 'hosting' : 'attending'}
                cta={hosting ? 'manage' : 'details'}
                tone={hosting ? 'strong' : 'quiet'}
                onPress={() => {
                  setPlansSheetVisible(false);
                  router.push(
                    hosting
                      ? `/events/host/${event.id}`
                      : `/(tabs)/chats/${event.id}`
                  );
                }}
              />
            ))}
          </View>
        </ScrollView>
      </Sheet>

    </View>
  );
}

const styles = StyleSheet.create({
  // No background colour: <AppBackground> is mounted behind the tab navigator
  // and this screen is a transparent sheet over it.
  root: { flex: 1 },
  // The layer that recedes behind the notifications screen. Everything that
  // scrolls lives inside it; the two sheets stay outside, since a sheet that
  // shrank with the page would be a modal that isn't quite modal.
  fill: { flex: 1 },
  // Not animated, and not a fade — the moment an overlay exists it owns the
  // element it took over, and the moment it is gone this one has it back.
  // Anything in between would be visible as a second copy.
  handedOver: { opacity: 0 },
  // paddingTop/paddingBottom are applied inline — the top comes from the safe
  // area and the bottom from the floating tab bar's clearance, both of which
  // are device-dependent.
  scroll: { paddingHorizontal: SPACING[5], gap: SPACING[5] },

  headerTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  headerText: { flex: 1 },
  greeting: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.caption,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: COLORS.textEyebrow,
    marginBottom: SPACING[1],
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  name: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.h1,
    lineHeight: 30,
    letterSpacing: -0.7,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  wave: {
    fontSize: TYPE_SIZE.titleLg,
    lineHeight: 30,
    // Pivot near the wrist so the rotation reads as a wave, not a spin.
    transformOrigin: '75% 100%',
  },
  // 46 to match the avatar beside it; radius is half the width, which is
  // geometry rather than a step on the radius scale.
  headerBtn: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDot: {
    position: 'absolute',
    top: 11,
    right: 12,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.white,
  },

  searchBar: {
    height: 54,
    paddingHorizontal: SPACING[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
  },
  searchText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textMuted,
  },

  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    marginBottom: -SPACING[1.5],
  },
  cityText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: SPACING[3.5],
  },
  sectionTitle: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.titleLg,
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
  },
  seeAll: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },

  // Tonight near you — full-bleed photo cards
  nearbyScroll: { marginHorizontal: -SPACING[5] },
  nearbyScrollContent: {
    paddingHorizontal: SPACING[5],
    paddingVertical: SPACING[1],
    gap: SPACING[3.5],
  },
  nearbyCard: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: RADIUS['3xl'],
    overflow: 'hidden',
    backgroundColor: COLORS.accentMid,
    ...SHADOWS.photoCard,
  },
  metaPill: {
    position: 'absolute',
    top: SPACING[3.5],
    left: SPACING[3.5],
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1.5],
  },
  saveBtn: { position: 'absolute', top: SPACING[3], right: SPACING[3] },
  saveBtnGlass: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // White, because `onPhoto` is the dark tier.
  metaText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.white,
  },
  // Natural height — the frost is a child, so the band is however tall the
  // caption is. paddingTop is the cushion between the frost's hard top edge and
  // the host row; paddingBottom the cushion under the Join button.
  nearbyBody: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[3],
    paddingBottom: SPACING[3.5],
  },
  nearbyHostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    // Air between "is hosting" and the event title. They are different kinds of
    // fact — who, then what — and ran together at 4pt.
    marginBottom: SPACING[2.5],
  },
  rowSpacer: { flex: 1 },
  nearbyHostName: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.white,
    flexShrink: 1,
  },
  nearbyHostLabel: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: 'rgba(255,255,255,0.82)',
  },
  nearbyTitle: {
    fontFamily: FONTS.headingBold,
    fontSize: TYPE_SIZE.bodyLg,
    lineHeight: 17,
    letterSpacing: -0.3,
    color: COLORS.white,
  },
  nearbyTime: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: 'rgba(255,255,255,0.8)',
  },
  nearbyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    marginTop: SPACING[2.5],
  },
  footerFill: { flex: 1, minWidth: 0 },
  // Coral. Joining something is the one thing this screen exists to get you to
  // do, so it takes the brand colour and the glow that goes with it.
  //
  // Worth naming, since AGENTS.md asks for roughly one coral CTA per screen and
  // a row of cards means several: they are the *same* action repeated, not
  // competing ones, so they read as one offer rather than as several shouts.
  // Nothing else on this screen is coral except the location pin and the
  // hosting dot.
  // Sized to its label, not to the space available. A button that stretches to
  // fill the row reads as a banner; one that hugs its word reads as a button.
  joinBtn: {
    height: 36,
    paddingHorizontal: SPACING[6],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    ...SHADOWS.primary,
  },
  joinBtnText: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.white,
  },
  // Requested: waiting on the host, so neither an offer nor a settled fact.
  // Neutral glass says "in progress" without claiming either.
  requestedBtn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    shadowOpacity: 0,
    elevation: 0,
  },
  // Going: settled, and green because that is what green means. Solid rather
  // than the tinted chip the white cards use — `successTint` is a near-white
  // fill designed to sit on paper, and on the dark band it would read as a
  // brighter, louder chip than the coral it is meant to be calmer than.
  //
  // Keeps the glow off: the cards you can still act on should be the ones that
  // catch the eye.
  goingBtn: {
    backgroundColor: COLORS.success,
    shadowOpacity: 0,
    elevation: 0,
  },

  rowList: { gap: SPACING[2.5] },

  // Sits between the hero and the attending rows; rowList's gap does the rest.
  alsoLabel: { marginTop: SPACING[1] },

  plansSheetCard: { paddingHorizontal: SPACING[5] },
  plansSheetTitle: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.titleLg,
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    marginBottom: SPACING[3.5],
  },
  plansSheetScroll: { maxHeight: 420 },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    gap: SPACING[1.5],
    paddingVertical: SPACING[7],
    paddingHorizontal: SPACING[5],
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[1],
  },
  emptyTitle: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  exploreBtn: {
    marginTop: SPACING[3.5],
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING[5],
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.sm,
  },
  exploreBtnText: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.white,
  },
});
