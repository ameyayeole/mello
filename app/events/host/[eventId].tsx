import { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import LottieView from 'lottie-react-native';
import {
  countEventSavers,
  getEventDetail,
  getEventSavers,
} from '@/services/events.service';
import { getEventUnreadCount } from '@/services/chat.service';
import {
  getEventFeedback,
  getEventNotes,
  hasWrapped,
} from '@/services/wrap.service';
import { useWrap } from '@/hooks/useWrap';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatEventWhen } from '@/utils/time';
import { eventImageUri } from '@/utils/events';
import { isPremium, PREMIUM_GOLD, premiumGoldTint } from '@/utils/premium';
import { categoryStyle } from '@/constants/categoryStyle';
import { BOOST_ACCENT, BOOST_EMOJI, isBoosted } from '@/utils/boost';
import ParticipantRow from '@/components/events/ParticipantRow';
import BoostCard from '@/components/events/BoostCard';
import HostNotesCarousel from '@/components/events/HostNotesCarousel';
import {
  ActivityGlyph,
  Avatar,
  Button,
  EmptyState,
  Glass,
  Icon,
  type IconName,
  Loader,
  PressableScale,
  Screen,
} from '@/components/ui';
import { SkeletonGroup } from '@/components/ui';
import { SkeletonPersonRow } from '@/components/skeletons';
import { openEventChat } from '@/utils/chatActions';
import { themedStyles } from '@/theme';

// How many attendees / requests show inline before "See all" takes over.
const PREVIEW_COUNT = 3;

// ─── The hero, ported from profile.tsx ───────────────────────────────────────
//
// Same tree, same three animated styles, same constants — see
// docs/design/manage-event-redesign.html §04. Only HERO_RATIO differs: profile
// is 1.25 (a portrait of a person), an event is a screen-width square
// (DESIGN.md §7).
const HERO_RATIO = 1;
const SHEET_RADIUS = 32;
const PARALLAX = 0.5;
// The photo is taller than the hero by this much and pulled up by the same, so
// the extra sits off the top at rest and is there to be revealed by a pull-down.
const PHOTO_BLEED = 250;
// Extra sheet drawn past the end of the content, cancelled by a negative margin
// of the same size — what the bottom rubber band reveals is more sheet, never
// bare screen.
const SHEET_UNDERHANG = 500;
const KEN_BURNS_SCALE = 1.07;
const KEN_BURNS_MS = 24000;

// A photoless event gets 16:9, not a square. A screen-width square of flat
// category tint is a lot of nothing.
const FALLBACK_RATIO = 9 / 16;

/**
 * One statistic in the pulse strip.
 *
 * `alert` is the whole attention mechanism on this screen: the requests figure
 * goes coral above zero and is white at zero. No badge, no dot, no red — the
 * number itself is the signal.
 */
function Pulse({
  value,
  label,
  alert = false,
}: {
  value: number;
  label: string;
  alert?: boolean;
}) {
  return (
    <View style={styles.pulse}>
      <Text style={[styles.pulseValue, alert && styles.pulseValueAlert]}>
        {value}
      </Text>
      <Text style={styles.pulseLabel}>{label}</Text>
    </View>
  );
}

/**
 * One action tile: a glyph well, a label, and an optional dot.
 *
 * The dot is `COLORS.primary`, not `COLORS.error`. Coral next to coral is one
 * colour; `#EF4444` beside `#F95B5B` reads as two rival reds, and this marks
 * "something here", not "something wrong".
 *
 * No sub-labels. State lives on the well — a dot for "there is something", or
 * the well going solid for boosted, because a dot cannot say "23h left".
 */
function ActionTile({
  icon,
  emoji,
  label,
  onPress,
  dot = false,
  solid,
  glyphColor,
}: {
  icon?: IconName;
  // The boost is an emoji everywhere else in the app (`BOOST_EMOJI`); a tile is
  // not the place to invent a flame path that agrees with nothing.
  emoji?: string;
  label: string;
  onPress: () => void;
  dot?: boolean;
  // A filled well, for a state a dot cannot express.
  solid?: string;
  glyphColor?: string;
}) {
  return (
    <PressableScale
      scaleTo={0.97}
      style={styles.tile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.tileWell, !!solid && { backgroundColor: solid }]}>
        {emoji ? (
          <Text style={styles.tileEmoji}>{emoji}</Text>
        ) : (
          <Icon
            name={icon!}
            size={20}
            color={solid ? COLORS.white : (glyphColor ?? COLORS.white)}
            strokeWidth={2}
          />
        )}
        {dot && <View style={styles.tileDot} />}
      </View>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

function SectionHead({
  title,
  count,
  onSeeAll,
}: {
  title: string;
  count?: number;
  onSeeAll?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>
        {title}
        {count !== undefined ? ` · ${count}` : ''}
      </Text>
      {onSeeAll && (
        // Was a bare `<Text onPress>` — no hit-slop, no pressed state.
        <PressableScale
          scaleTo={0.94}
          onPress={onSeeAll}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`See all ${title.toLowerCase()}`}
        >
          <Text style={styles.seeAll}>See all</Text>
        </PressableScale>
      )}
    </View>
  );
}

export default function HostPanelScreen() {
  // celebrate=1 is passed only right after the in-map creation flow finishes:
  // same screen, but it opens on a "you're hosting!" note.
  const { eventId, celebrate } = useLocalSearchParams<{
    eventId: string;
    celebrate?: string;
  }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const { data: event, isLoading } = useQuery({
    queryKey: queryKeys.eventDetail.of(eventId),
    queryFn: () => getEventDetail(eventId),
    enabled: !!eventId,
  });

  const isHost = !!event && event.host_id === user?.id;
  const coverUri = event ? eventImageUri(event) : null;
  const premium = isPremium(user);
  const ended = !!event && hasWrapped(event);

  // Post-event: anonymous feedback aggregate + encore demand.
  const { status: wrapStatus } = useWrap(ended ? eventId : undefined);
  const { data: feedbackSummary } = useQuery({
    queryKey: ['eventFeedback', eventId],
    queryFn: () => getEventFeedback(eventId!),
    enabled: !!eventId && ended && isHost,
    staleTime: 60_000,
  });
  const attendees = (event?.participants ?? []).filter(
    (p) => p.status === 'approved' && p.id !== user?.id
  );
  // Mello+ members' requests surface first.
  const requests = (event?.participants ?? [])
    .filter((p) => p.status === 'pending')
    .sort((a, b) => Number(isPremium(b)) - Number(isPremium(a)));

  // Wishlist insight: every host gets the count; only Mello+ hosts get names.
  const { data: saversCount = 0 } = useQuery({
    queryKey: ['eventSaversCount', eventId],
    queryFn: () => countEventSavers(eventId),
    enabled: isHost,
    retry: 1,
  });
  const { data: savers = [] } = useQuery({
    queryKey: ['eventSavers', eventId],
    queryFn: () => getEventSavers(eventId),
    enabled: isHost && premium,
    retry: 1,
  });

  // D2: the chat CTA's unread count. Refetched whenever the screen comes back
  // into focus, which is precisely when it can have changed — you left this
  // screen for the thread, read it, and came back.
  const unread = useQuery({
    queryKey: queryKeys.eventUnread.of(eventId),
    queryFn: () => getEventUnreadCount(eventId, user!.id),
    enabled: isHost && !!user,
    staleTime: 30_000,
  });
  useFocusEffect(
    useCallback(() => {
      unread.refetch();
      // Refetching is the effect; `unread` changes identity every render.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId])
  );

  // The notes left for this host, for this event only.
  const { data: notes = [] } = useQuery({
    queryKey: ['eventNotes', eventId, user?.id],
    queryFn: () => getEventNotes(user!.id, eventId),
    enabled: isHost && ended && !!user,
    staleTime: 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.eventDetail.of(eventId) });
    qc.invalidateQueries({ queryKey: queryKeys.myEvents.all });
  };

  // ─── The hero's motion ─────────────────────────────────────────────────────
  const heroHeight = coverUri ? width * HERO_RATIO : width * FALLBACK_RATIO;
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // Two branches, one job: the photo's bottom edge never parts from the sheet.
  const photoStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    if (y < 0) {
      // Pull-down. `transformOrigin: bottom` pins the bottom edge to the sheet
      // and grows the photo upward by exactly the overscroll distance.
      return { transform: [{ scale: 1 - y / heroHeight }] };
    }
    // Scroll up: the window travels at `y`, the photo at half that, so the
    // photo lags and its bottom is clipped rather than sliding under the glass.
    return { transform: [{ translateY: y * PARALLAX }] };
  });

  // Its own layer *inside* the parallax one. The two motions have different
  // origins — parallax scales from the bottom to stay welded, Ken Burns from the
  // centre so it creeps — and one combined transform breaks both.
  const ken = useSharedValue(1);
  useEffect(() => {
    if (!coverUri) return;
    ken.value = withRepeat(
      withTiming(KEN_BURNS_SCALE, {
        duration: KEN_BURNS_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [ken, coverUri]);
  const kenStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ken.value }],
  }));

  // The frost lives inside the sheet, and the sheet scrolls — so it is
  // counter-translated by the sheet's own offset. Real glass does not drag its
  // reflection along with it.
  const frostStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value - heroHeight + SHEET_RADIUS }],
  }));

  if (isLoading || !event) {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  if (!isHost) {
    // Not this user's event — nothing to manage here.
    return (
      <Screen>
        <Text style={styles.notHostText}>
          Only the host can manage this event.
        </Text>
      </Screen>
    );
  }

  const cat = categoryStyle(event.activity);
  const boosted = isBoosted(event);

  return (
    // `edges={['top']}` only: this route is outside the tab navigator, so the
    // bottom inset is applied to the sheet's own padding instead — insetting
    // here as well would pad it twice.
    <Screen
      edges={[]}
      statusBar="light"
      background={COLORS.accent}
      style={styles.screen}
    >
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* The photo lives INSIDE the scroll layer, in a window that clips it,
            so it can lag behind the sheet without ever parting from it. Pinning
            it looks identical at rest and wrong the moment you scroll. A plain
            View, not a Pressable: a lightbox is a new surface, and this is a
            reskin. */}
        <View style={[styles.photoWindow, { height: heroHeight + PHOTO_BLEED }]}>
          <Animated.View
            style={[
              styles.photoInner,
              { height: heroHeight },
              // No parallax on the fallback: motion on a flat field is visibly
              // fake.
              coverUri ? photoStyle : null,
            ]}
          >
            {coverUri ? (
              <Animated.View style={[StyleSheet.absoluteFill, kenStyle]}>
                <Image
                  source={{ uri: coverUri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={200}
                />
              </Animated.View>
            ) : (
              <View
                style={[styles.photoFallback, { backgroundColor: cat.tint }]}
              >
                <ActivityGlyph
                  activity={event.activity}
                  size={64}
                  color={cat.accent}
                />
              </View>
            )}

            {/* Darkens the top so the chips and the status bar stay legible on a
                bright photo. Rides with the photo rather than being pinned, or
                its top edge would band as the sheet comes up. */}
            <Svg style={styles.photoTopFade}>
              <Defs>
                <LinearGradient id="hostTopFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={COLORS.ink} stopOpacity={0.55} />
                  <Stop offset="1" stopColor={COLORS.ink} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#hostTopFade)" />
            </Svg>
          </Animated.View>

          {/* A sibling of `photoInner`, anchored to the window's bottom — not a
              child. An event's title belongs to its image, but as a child it
              would inherit the pull-down scale and balloon on overscroll. */}
          <View style={styles.caption} pointerEvents="none">
            <Text style={styles.eyebrow}>
              {ended ? (
                `Ended · ${formatEventWhen(event.starts_at)}`
              ) : (
                <>
                  <Text style={styles.livePulse}>● </Text>
                  {formatEventWhen(event.starts_at)}
                </>
              )}
            </Text>
            <Text style={styles.title} numberOfLines={2}>
              {event.title}
            </Text>
            {event.location_name ? (
              <View style={styles.captionMeta}>
                <Icon name="location" size={13} color={COLORS.textOnDark} />
                <Text style={styles.captionMetaText} numberOfLines={1}>
                  {event.location_name}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Glass
          tier="onPhoto"
          radius={SHEET_RADIUS}
          edge="top"
          // The pane frosts itself rather than blurring what is behind it. This
          // route is outside the tabs tree, so there is no <AppBackground>
          // here — an ordinary panel would blur flat grey and read as a white
          // box. With a backdrop, what sits behind stops mattering, and an image
          // blur needs no platform support, so iOS and Android match.
          //
          // The fallback still gets one: a 16:9 field leaves the sheet blurring
          // whatever is past it and printing an edge where the field stops.
          backdrop={
            coverUri ? (
              <Animated.View
                style={[styles.frost, { height }, frostStyle]}
                pointerEvents="none"
              >
                <Image
                  source={{ uri: coverUri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  blurRadius={60}
                />
                <View style={styles.frostVeil} />
              </Animated.View>
            ) : (
              <View
                style={[StyleSheet.absoluteFill, { backgroundColor: cat.tint }]}
              />
            )
          }
          style={[
            styles.sheet,
            {
              minHeight: height - heroHeight + SHEET_RADIUS + SHEET_UNDERHANG,
              paddingBottom: SPACING[8] + insets.bottom + SHEET_UNDERHANG,
              marginBottom: -SHEET_UNDERHANG,
            },
          ]}
        >
          {celebrate === '1' && (
            <Animated.View
              entering={FadeInDown.duration(400)}
              style={styles.congrats}
            >
              <Text style={styles.congratsEmoji}>🎉</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.congratsTitle}>You&apos;re hosting!</Text>
                <Text style={styles.congratsSub}>
                  Your event is live on the map. We&apos;ll let you know as
                  people join — this is your event HQ.
                </Text>
              </View>
            </Animated.View>
          )}

          {/* ── Position 1 ─────────────────────────────────────────────────
              Live: the pulse strip. Ended: how it landed, and the way in to
              the wrap — live counts are history by then. */}
          {ended ? (
            <Animated.View
              entering={FadeInDown.duration(350)}
              style={styles.lift}
            >
              <View style={styles.wrapStatsRow}>
                <Pulse
                  value={feedbackSummary?.upCount ?? 0}
                  label="👍 loved it"
                />
                <View style={styles.pulseDivider} />
                <Pulse
                  value={feedbackSummary?.downCount ?? 0}
                  label="👎 not great"
                />
                <View style={styles.pulseDivider} />
                <Pulse
                  value={wrapStatus?.encoreCount ?? 0}
                  label="🔁 rewind"
                />
              </View>
              {(feedbackSummary?.notes?.length ?? 0) > 0 && (
                <View style={styles.wrapNotes}>
                  {feedbackSummary!.notes.slice(0, 3).map((n, i) => (
                    <Text key={i} style={styles.wrapNoteText}>
                      “{n}”
                    </Text>
                  ))}
                  <Text style={styles.wrapNotesHint}>
                    Feedback is anonymous.
                  </Text>
                </View>
              )}
              <Button
                label="Open the event wrap"
                variant="primary"
                height={46}
                fullWidth
                onPress={() => router.push(`/events/wrap/${event.id}`)}
              />
            </Animated.View>
          ) : (
            <Animated.View
              entering={FadeInDown.duration(350)}
              style={[styles.lift, styles.pulseStrip]}
            >
              <Pulse value={event.participant_count} label="going" />
              <View style={styles.pulseDivider} />
              <Pulse
                value={requests.length}
                label="requests"
                alert={requests.length > 0}
              />
              <View style={styles.pulseDivider} />
              <Pulse value={saversCount} label="wishlisted" />
            </Animated.View>
          )}

          {/* ── Position 2 · what a host does here ──────────────────────────
              Check-in and boost are meaningless after the event, so the ended
              screen keeps only the chat. */}
          {!ended && (
            <Animated.View
              entering={FadeInDown.delay(30).duration(350)}
              style={styles.tiles}
            >
              <ActionTile
                icon="scan"
                label="Check in"
                onPress={() => router.push(`/events/checkin/${event.id}`)}
              />
              <BoostCard
                event={event}
                saversCount={saversCount}
                onBoosted={invalidate}
                renderTrigger={(open) => (
                  <ActionTile
                    emoji={BOOST_EMOJI}
                    label={boosted ? 'Boosted' : 'Boost'}
                    onPress={open}
                    // A filled well, not a dot: a dot cannot say "23h left".
                    solid={boosted ? BOOST_ACCENT : undefined}
                    glyphColor={BOOST_ACCENT}
                  />
                )}
              />
            </Animated.View>
          )}

          {/* D3: chat keeps its full-width button rather than becoming a third
              tile. It is the one thing a host comes back to this screen for. */}
          <Animated.View entering={FadeInDown.delay(45).duration(350)}>
            <View>
              <Button
                label="Open event chat"
                icon="chat"
                variant="secondary"
                fullWidth
                onPress={() => openEventChat(event.id)}
                style={styles.chatCta}
              />
              {(unread.data ?? 0) > 0 && (
                // Coral, like the pulse strip's requests figure and the tiles'
                // dot — one colour for "there is something here" across the
                // whole screen.
                <View style={styles.chatBadge} pointerEvents="none">
                  <Text style={styles.chatBadgeText}>
                    {unread.data! > 9 ? '9+' : unread.data}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* ── Position 3 (ended) · the notes this host was left ──────────
              Absent when there are none. Authored by construction: `wrap_notes`
              carries a sender, unlike the feedback above it, which is anonymous
              and stays that way. */}
          {ended && notes.length > 0 && (
            <Animated.View entering={FadeInDown.delay(60).duration(350)}>
              <SectionHead title="Notes for you" count={notes.length} />
              <View style={styles.lift}>
                <HostNotesCarousel
                  notes={notes}
                  sheetWidth={width - SPACING[5] * 2 - SPACING[4] * 2}
                />
              </View>
            </Animated.View>
          )}

          {/* ── Position 3 · requests, above the rest. Urgency, not feature ──
              D1: gone entirely once the event has ended. Admitting someone to
              an event that already happened is not a decision worth surfacing. */}
          {!ended && requests.length > 0 && (
            <Animated.View entering={FadeInDown.delay(60).duration(350)}>
              <SectionHead
                title="Requests"
                count={requests.length}
                onSeeAll={
                  requests.length > PREVIEW_COUNT
                    ? () =>
                        router.push(
                          `/events/attendees/${event.id}?tab=requests`
                        )
                    : undefined
                }
              />
              <View style={styles.rowStack}>
                {requests.slice(0, PREVIEW_COUNT).map((p, i) => (
                  <ParticipantRow
                    key={p.id}
                    eventId={event.id}
                    person={p}
                    surface="row"
                    first={i === 0}
                    onChanged={invalidate}
                  />
                ))}
              </View>
            </Animated.View>
          )}

          {/* ── Attendees ───────────────────────────────────────────────── */}
          <Animated.View entering={FadeInDown.delay(90).duration(350)}>
            <SectionHead
              title="Attendees"
              count={attendees.length}
              onSeeAll={
                attendees.length > PREVIEW_COUNT
                  ? () =>
                      router.push(`/events/attendees/${event.id}?tab=attendees`)
                  : undefined
              }
            />
            {attendees.length === 0 ? (
              <View style={styles.lift}>
                <EmptyState
                  icon="userPlus"
                  title="No one yet"
                  body="Share your event to get it going."
                  onDark
                />
              </View>
            ) : (
              <View style={styles.rowStack}>
                {attendees.slice(0, PREVIEW_COUNT).map((p, i) => (
                  <ParticipantRow
                    key={p.id}
                    eventId={event.id}
                    person={p}
                    surface="row"
                    first={i === 0}
                    showAddFriend
                    onChanged={invalidate}
                  />
                ))}
              </View>
            )}
          </Animated.View>

          {/* ── Wishlist · dead information once the event has happened ──── */}
          {!ended && saversCount > 0 && (
            <Animated.View entering={FadeInDown.delay(120).duration(350)}>
              <SectionHead title="Wishlisted" count={saversCount} />
              {premium ? (
                <View style={styles.rowStack}>
                  {savers.slice(0, PREVIEW_COUNT).map((s, i) => (
                    <PressableScale
                      key={s.id}
                      scaleTo={0.98}
                      style={[styles.saverRow, i > 0 && styles.rowDivider]}
                      onPress={() => router.push(`/friends/${s.id}`)}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${s.name}'s profile`}
                    >
                      <Avatar name={s.name} photoUrl={s.photo_url} size={38} />
                      <Text style={styles.saverName} numberOfLines={1}>
                        {s.name}
                      </Text>
                      <Icon
                        name="chevronRight"
                        size={16}
                        color={COLORS.textOnDarkMuted}
                      />
                    </PressableScale>
                  ))}
                </View>
              ) : (
                <LockedWishlist
                  count={saversCount}
                  onUnlock={() => router.push('/premium?reason=wishlist')}
                />
              )}
            </Animated.View>
          )}
        </Glass>
      </Animated.ScrollView>

      {/* Chrome over the photo. Absolute rather than a ScreenHeader: the hero
          runs to the top edge, and a header bar would put a band of chrome
          across it. */}
      <View style={[styles.chrome, { top: insets.top + SPACING[2] }]}>
        <PressableScale
          scaleTo={0.9}
          style={styles.chip}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon name="back" size={20} color={COLORS.white} strokeWidth={2.2} />
        </PressableScale>
        <View style={{ flex: 1 }} />
        <PressableScale
          scaleTo={0.94}
          style={[styles.chip, styles.chipWide]}
          onPress={() => router.push(`/events/edit/${event.id}`)}
          accessibilityRole="button"
          accessibilityLabel="Edit event"
        >
          <Icon name="edit" size={15} color={COLORS.white} strokeWidth={2.2} />
          <Text style={styles.chipLabel}>Edit</Text>
        </PressableScale>
      </View>

      {/* One-shot confetti burst over the whole screen right after creation. */}
      {celebrate === '1' && (
        <LottieView
          source={require('../../../assets/lottie/celebration.json')}
          autoPlay
          loop={false}
          resizeMode="cover"
          style={styles.celebrationOverlay}
        />
      )}
    </Screen>
  );
}

/**
 * The locked wishlist: the same row stack as requests and attendees, frosted
 * over, with the crown and a Mello+ pill on top.
 *
 * **The rows behind the frost are placeholders, and that is the point.**
 * `getEventSavers` is `enabled: isHost && premium`, so a free host never
 * receives the list — correct, not a limitation to work around. A blur is a
 * visual effect, not a security boundary: fetch the names to blur them and they
 * are in the response, the cache and the tree. Bones driven by the count give
 * the real number with no real identities.
 */
function LockedWishlist({
  count,
  onUnlock,
}: {
  count: number;
  onUnlock: () => void;
}) {
  return (
    <PressableScale
      scaleTo={0.98}
      onPress={onUnlock}
      accessibilityRole="button"
      accessibilityLabel={`See who wishlisted this event with Mello+`}
      style={styles.lockedWrap}
    >
      <View style={styles.rowStack} pointerEvents="none">
        <SkeletonGroup>
          <SkeletonPersonRow count={Math.min(Math.max(count, 1), 3)} onDark />
        </SkeletonGroup>
      </View>

      {/* One pane over the stack, not one per row. Android falls back to a flat
          fill, which is fine — the job is to obscure, and what it obscures is a
          placeholder. */}
      <Glass
        tier="onPhoto"
        radius={RADIUS['2xl']}
        style={StyleSheet.absoluteFill}
        shadow={false}
      >
        <View style={styles.lockedInner}>
          <View style={styles.lockedCrown}>
            <Icon name="crown" size={18} color={PREMIUM_GOLD} strokeWidth={2} />
          </View>
          <Text style={styles.lockedTitle}>
            {count} {count === 1 ? 'person has' : 'people have'} wishlisted this
          </Text>
          <View style={styles.lockedPill}>
            <Text style={styles.lockedPillText}>See who with Mello+</Text>
          </View>
        </View>
      </Glass>
    </PressableScale>
  );
}

const styles = themedStyles(() => ({
  screen: { backgroundColor: COLORS.accent },
  notHostText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[12],
  },

  // ─── Hero ──────────────────────────────────────────────────────────────
  // Taller than the photo by PHOTO_BLEED and pulled up by the same amount, so
  // the extra sits off the top of the screen at rest and costs no scroll.
  photoWindow: { marginTop: -PHOTO_BLEED, overflow: 'hidden' },
  // Anchored to the window's *bottom* — the edge that has to stay welded to the
  // sheet. `transformOrigin` keeps it there through the pull-down scale, and
  // without it a hairline of what is behind shows through while dragging.
  photoInner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    transformOrigin: 'bottom',
  },
  photoFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTopFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 },

  caption: {
    position: 'absolute',
    left: SPACING[5],
    right: SPACING[5],
    bottom: SHEET_RADIUS + SPACING[4],
    gap: SPACING[1],
  },
  eyebrow: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textOnDark,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  livePulse: { color: COLORS.primary },
  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.h1,
    lineHeight: TYPE_SIZE.h1 * 1.1,
    letterSpacing: -0.6,
    color: COLORS.white,
  },
  captionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    marginTop: SPACING[0.5],
  },
  captionMetaText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textOnDark,
  },

  frost: { position: 'absolute', top: 0, left: 0, right: 0 },
  // Knocks the frost back so white type stays legible over a bright photo.
  // `inkVeil` (0.28) rather than `scrim` (0.45): the photo's colour should carry
  // through the glass, and 0.45 kills it.
  frostVeil: { ...StyleSheet.absoluteFill, backgroundColor: COLORS.inkVeil },

  // Pulled up so its rounded corners sit over the photo's last SHEET_RADIUS.
  sheet: {
    marginTop: -SHEET_RADIUS,
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[5],
    gap: SPACING[4],
  },

  // ─── The on-dark ramp inside the sheet ─────────────────────────────────
  // Cards nested here are a translucent white lift, never a second <Glass>: a
  // blur inside a blur is a native blur view per row and reads as mud.
  lift: {
    backgroundColor: COLORS.fillOnDark,
    borderRadius: RADIUS['2xl'],
    borderWidth: 1,
    borderColor: COLORS.borderOnDark,
    padding: SPACING[4],
    gap: SPACING[3.5],
  },

  congrats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    backgroundColor: COLORS.fillOnDark,
    borderRadius: RADIUS['2xl'],
    borderWidth: 1,
    borderColor: COLORS.borderOnDark,
    padding: SPACING[4],
  },
  congratsEmoji: { fontSize: 30 },
  congratsTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.bodyLg,
    color: COLORS.white,
  },
  congratsSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 17,
    color: COLORS.textOnDark,
    marginTop: SPACING[0.5],
  },

  // ─── Pulse strip ───────────────────────────────────────────────────────
  pulseStrip: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  pulse: { flex: 1, alignItems: 'center', gap: SPACING[0.5] },
  pulseValue: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.titleLg,
    color: COLORS.white,
  },
  // The whole attention mechanism: the number itself, coral above zero.
  pulseValueAlert: { color: COLORS.primary },
  pulseLabel: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textOnDarkMuted,
  },
  pulseDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.borderOnDark,
  },

  // ─── Action tiles ──────────────────────────────────────────────────────
  tiles: { flexDirection: 'row', gap: SPACING[3] },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: COLORS.fillOnDark,
    borderRadius: RADIUS['2xl'],
    borderWidth: 1,
    borderColor: COLORS.borderOnDark,
    paddingVertical: SPACING[3.5],
  },
  tileWell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.fillOnDarkStrong,
  },
  tileDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  tileEmoji: { fontSize: 20 },
  tileLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.white,
  },
  chatCta: { marginTop: -SPACING[1] },
  chatBadge: {
    position: 'absolute',
    top: -SPACING[2],
    right: -SPACING[1],
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: SPACING[1.5],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  chatBadgeText: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.white,
  },

  // ─── Sections ──────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING[2.5],
  },
  sectionTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.bodyLg,
    color: COLORS.white,
  },
  seeAll: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.primary,
  },
  // Six attendees means one surface, not six.
  rowStack: {
    backgroundColor: COLORS.fillOnDark,
    borderRadius: RADIUS['2xl'],
    borderWidth: 1,
    borderColor: COLORS.borderOnDark,
    overflow: 'hidden',
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderOnDark,
  },

  saverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingHorizontal: SPACING[3.5],
    paddingVertical: SPACING[2.5],
  },
  saverName: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.white,
  },

  // ─── Locked wishlist ───────────────────────────────────────────────────
  lockedWrap: { position: 'relative', overflow: 'hidden', borderRadius: RADIUS['2xl'] },
  lockedInner: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[5],
  },
  lockedCrown: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: premiumGoldTint(),
  },
  lockedTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.white,
    textAlign: 'center',
  },
  lockedPill: {
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1.5],
    borderRadius: RADIUS.full,
    backgroundColor: premiumGoldTint(),
  },
  lockedPillText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: PREMIUM_GOLD,
  },

  // ─── Post-event ────────────────────────────────────────────────────────
  wrapStatsRow: { flexDirection: 'row', alignItems: 'center' },
  wrapNotes: { gap: SPACING[1.5] },
  wrapNoteText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textOnDark,
    fontStyle: 'italic',
  },
  wrapNotesHint: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textOnDarkMuted,
  },

  // ─── Chrome ────────────────────────────────────────────────────────────
  chrome: {
    position: 'absolute',
    left: SPACING[4],
    right: SPACING[4],
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    height: 38,
    minWidth: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.glassOnPhoto,
    borderWidth: 1,
    borderColor: COLORS.glassBorderOnPhoto,
  },
  chipWide: {
    flexDirection: 'row',
    gap: SPACING[1.5],
    paddingHorizontal: SPACING[3.5],
  },
  chipLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.white,
  },

  celebrationOverlay: {
    ...StyleSheet.absoluteFill,
    pointerEvents: 'none',
  },
}));
