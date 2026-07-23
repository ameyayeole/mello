import { useEffect, useRef, useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import {
  useHandedOver,
  useOpenOverlay,
  useOverlayRecede,
} from '@/hooks/useOverlayScreen';
import {
  getSavedEvents,
  unsaveEvent,
  getJoinedEvents,
  getMyEvents,
  getAttendeePreviews,
} from '@/services/events.service';
import { shareEvent } from '@/utils/shareEvent';
import { useUIStore } from '@/stores/uiStore';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatEventWhen } from '@/utils/time';
import { splitByWhen, featuredHostedEvent } from '@/utils/events';
import { hasWrapped } from '@/services/wrap.service';
import {
  isPremium,
  PREMIUM_GOLD_ON_DARK,
  PREMIUM_GOLD_BORDER_ON_DARK,
  PREMIUM_GOLD_TINT_ON_DARK,
} from '@/utils/premium';
import { NearbyEvent } from '@/types/models';
import {
  Avatar,
  Button,
  CategoryPill,
  Glass,
  Icon,
  NavButton,
  PremiumBadge,
  PressableScale,
  useTabBarInset,
  VerifiedBadge,
} from '@/components/ui';
import EventRow from '@/components/events/EventRow';
import FeaturedPlanCard from '@/components/events/FeaturedPlanCard';

// The photo is a 4:5 portrait, shown whole — cropping the user's own picture to
// a band is the one place in the app where that reads as a slight.
const HERO_RATIO = 1.25;
// Off the radius scale on purpose (DESIGN.md §6 leaves anything above `3xl` as
// a raw number): this is a sheet edge, not a card corner, and at 24 the
// full-width curve is too tight to read as one.
//
// The photo runs exactly this far under the sheet, so the rounded corners
// reveal photo rather than whatever happens to be further back. That is only
// safe because the sheet frosts itself (see `backdrop` below) — with a backdrop
// blur, the photo's edge under the glass printed a hard line across it.
const SHEET_RADIUS = 32;

// The photo drifts up at half the scroll speed, so the sheet visibly *catches*
// it rather than sliding across an image that never moved — which is what made
// the first version read as two unrelated planes.
//
// Deliberately no fade: the photo is the only thing covering the top of the
// screen, so fading it would open a hole rather than reveal anything.
const PARALLAX = 0.5;

// Room above the photo for it to grow into when you pull down past the top,
// taken back out again by an equal negative margin so it costs no scroll
// distance — the same trick as SHEET_UNDERHANG, at the other end. Without it
// the rubber band parts the photo from the top of the screen and opens a gap.
// Comfortably past iOS's bounce.
const PHOTO_BLEED = 250;

// Ken Burns. 24s out, 24s back, and only 7% of travel — from the mockup, and
// the restraint is the point: you should never catch it moving, only notice
// that a still photo somehow isn't dead. Runs on the UI thread, so it survives
// a busy JS frame.
const KEN_BURNS_SCALE = 1.07;
const KEN_BURNS_MS = 24000;

// The highlight that sweeps the Mello+ card. Travels for 60% of the cycle then
// waits offscreen for the rest, which is what stops it reading as a barber
// pole — the mockup's `60%,100%` keyframe stop.
const SHINE_TRAVEL_MS = 3120;
const SHINE_REST_MS = 2080;
const SHINE_WIDTH = 60;

// How far the sheet's fill is drawn past the end of its own content. Bottom
// overscroll would otherwise rubber-band the sheet up and expose the bare
// screen beneath it. Cancelled by an equal negative margin, so this costs no
// scroll distance — it only gives the rubber band more of the same glass to
// reveal. Comfortably past iOS's bounce, which tops out near a third of the
// screen.
const SHEET_UNDERHANG = 500;

// A stable identity, so the fallback does not hand the render a new object
// every time and defeat every memo below it. `splitByWhen` itself lives in
// `utils/events` — home needs the same cut, and it is pure enough to test.
const NO_EVENTS: ReturnType<typeof splitByWhen<NearbyEvent>> = {
  upcoming: [],
  attended: [],
};

// One metric box. Local rather than in `ui/` — four uses, all of them here, and
// a premature primitive is as bad as a fork.
//
// `flex: 1` on every box rather than a fixed width: four equal columns that
// divide whatever width the screen has, so the row stays even from an SE to a
// Pro Max instead of bunching left with a gap on the end.
function Stat({
  value,
  label,
  accent = false,
  onPress,
}: {
  value: number;
  label: string;
  accent?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );
  return onPress ? (
    <PressableScale style={styles.statBox} scaleTo={0.94} onPress={onPress}>
      {body}
    </PressableScale>
  ) : (
    <View style={styles.statBox}>{body}</View>
  );
}

export default function ProfileTabScreen() {
  const router = useRouter();

  // The settings chip flies from the top-right of this screen to the top-left
  // of the settings screen and becomes its back button — the same hand-off the
  // home screen makes to notifications and to search.
  const openOverlay = useOpenOverlay();
  const handedOver = useHandedOver();
  const recedeStyle = useOverlayRecede();
  const settingsRef = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const user = useAuthStore((s) => s.user);
  const { width, height } = useWindowDimensions();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [tab, setTab] = useState<'upcoming' | 'attended'>('upcoming');
  const queryClient = useQueryClient();

  // Wishlist: events saved from the swipe deck's bookmark button.
  const { data: wishlist = [] } = useQuery({
    queryKey: queryKeys.savedEvents.of(user?.id),
    queryFn: () => getSavedEvents(user!.id),
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
  });

  const { data: joined = NO_EVENTS } = useQuery({
    queryKey: queryKeys.joinedEvents.of(user?.id),
    queryFn: () => getJoinedEvents(user!.id),
    enabled: !!user,
    select: splitByWhen,
  });

  // The hosting hero, same card and same selector the home screen leads with:
  // the soonest event still to come, or the one that finished most recently so
  // the wrap stays reachable.
  const { data: hosting = null } = useQuery({
    queryKey: queryKeys.myEvents.of(user?.id),
    queryFn: () => getMyEvents(user!.id),
    enabled: !!user,
    select: featuredHostedEvent,
  });

  // Faces and the approved-only count. A second round trip rather than part of
  // the event row, because `participant_count` on a hosted event counts pending
  // requests too — see getAttendeePreviews and migration 038.
  const previewIds = hosting ? [hosting.id] : [];
  const { data: previews } = useQuery({
    queryKey: queryKeys.attendeePreviews.of(previewIds),
    queryFn: () => getAttendeePreviews(previewIds),
    enabled: previewIds.length > 0,
  });

  const removeSaved = useMutation({
    mutationFn: (eventId: string) => unsaveEvent(user!.id, eventId),
    onMutate: (eventId) => {
      queryClient.setQueryData<NearbyEvent[]>(
        queryKeys.savedEvents.of(user?.id),
        (events = []) => events.filter((e) => e.id !== eventId)
      );
      queryClient.setQueryData<string[]>(
        queryKeys.savedEventIds.of(user?.id),
        (ids = []) => ids.filter((i) => i !== eventId)
      );
    },
  });

  // Above the `!user` early return, and staying there: these are hooks, and
  // signing out flips `user` to null mid-mount. Neither depends on the user.
  const photoHeight = width * HERO_RATIO;

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // The photo moves inside a window that scrolls at full speed, so it is always
  // clipped at the window's bottom edge — which is the sheet's top edge. Both
  // branches keep that edge welded: nothing is ever exposed between the two.
  const photoStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    if (y < 0) {
      // Pull-down. `transformOrigin: bottom` pins the bottom edge to the sheet
      // and grows the photo upward by exactly the overscroll distance, so it
      // still reaches the top of the screen.
      return { transform: [{ scale: 1 - y / photoHeight }] };
    }
    // Scroll up. The window travels at `y`, the photo at half that, so the
    // photo lags — and its bottom `y/2` is clipped away rather than sliding
    // under the glass.
    return { transform: [{ translateY: y * PARALLAX }] };
  });

  // Ken Burns, on its own layer inside the parallax one. Two views rather than
  // one combined transform because the two motions have different origins: the
  // parallax scales from the bottom edge to stay welded to the sheet, the drift
  // scales from the centre so it creeps rather than slides.
  const ken = useSharedValue(1);
  useEffect(() => {
    ken.value = withRepeat(
      withTiming(KEN_BURNS_SCALE, {
        duration: KEN_BURNS_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [ken]);
  const kenStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ken.value }],
  }));

  // The Mello+ shine. `width` is the screen, and the card spans the sheet less
  // its padding.
  const cardWidth = width - SPACING[5] * 2;
  const shine = useSharedValue(0);
  useEffect(() => {
    shine.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: SHINE_TRAVEL_MS,
          easing: Easing.inOut(Easing.ease),
        }),
        // Parked off the right edge for the rest of the cycle, then snapped
        // back with a zero-length step so the return trip is never seen.
        withTiming(1, { duration: SHINE_REST_MS }),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );
  }, [shine]);
  // The sheet's frost. It lives inside the sheet, which scrolls — so it is
  // counter-translated by exactly the sheet's own offset, which pins it to the
  // screen. Real glass does not drag its own reflection along with it.
  const frostStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: scrollY.value - photoHeight + SHEET_RADIUS },
    ],
  }));

  const shineStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          shine.value,
          [0, 1],
          [-SHINE_WIDTH * 1.4, cardWidth + SHINE_WIDTH]
        ),
      },
      { skewX: '-18deg' },
    ],
  }));

  if (!user) return null;

  // The main photo is the gallery's first entry; fall back to photo_url for
  // profiles created before the gallery existed.
  const gallery = user.photos?.length
    ? user.photos
    : user.photo_url
      ? [user.photo_url]
      : [];
  const mainPhoto = gallery[0] ?? null;

  const tabRows = tab === 'upcoming' ? joined.upcoming : joined.attended;

  const metaBits = [
    user.username ? `@${user.username}` : null,
    user.age != null ? String(user.age) : null,
    user.city ?? null,
  ].filter(Boolean);

  function openViewer(index: number) {
    if (gallery.length === 0) {
      router.push('/profile/edit');
      return;
    }
    setViewerIndex(index);
    setViewerOpen(true);
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Animated.View style={[styles.fill, recedeStyle]}>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* The photo lives INSIDE the scroll layer, in a window that clips it,
            so it can lag behind the sheet without ever parting from it. Its
            bottom edge runs SHEET_RADIUS under the sheet, which is what fills
            the rounded corners with photo instead of with whatever is further
            back. It is also the photo's tap target — the sheet is above it. */}
        <Pressable
          style={[styles.photoWindow, { height: photoHeight + PHOTO_BLEED }]}
          onPress={() => openViewer(0)}
          accessibilityRole="button"
          accessibilityLabel={gallery.length ? 'View photos' : 'Add a photo'}
        >
          <Animated.View
            style={[styles.photoInner, { height: photoHeight }, photoStyle]}
          >
            {mainPhoto ? (
              <Animated.View style={[StyleSheet.absoluteFill, kenStyle]}>
                <Image
                  source={{ uri: mainPhoto }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={200}
                />
              </Animated.View>
            ) : (
              <View style={styles.photoFallback}>
                <Avatar name={user.name} size={96} />
                <Text style={styles.photoFallbackHint}>
                  Tap to add your photo
                </Text>
              </View>
            )}
            {/* Darkens the top of the photo so the status bar and the settings
                button stay legible over a bright image. Rides with the photo
                rather than being pinned to the screen: once the sheet has
                scrolled up there it is dark enough on its own, and a fixed
                gradient would band its top edge. */}
            <Svg style={styles.photoTopFade}>
              <Defs>
                <LinearGradient id="meTopFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={COLORS.ink} stopOpacity={0.5} />
                  <Stop offset="1" stopColor={COLORS.ink} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#meTopFade)" />
            </Svg>
          </Animated.View>
        </Pressable>

        <Glass
          tier="onPhoto"
          radius={SHEET_RADIUS}
          edge="top"
          // The pane frosts itself rather than blurring what is behind it, so
          // the photo can run under its corners and nothing it sits on can
          // print an edge through the glass. Identical on iOS and Android.
          backdrop={
            mainPhoto ? (
              <Animated.View
                style={[styles.frost, { height }, frostStyle]}
                pointerEvents="none"
              >
                <Image
                  source={{ uri: mainPhoto }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  blurRadius={60}
                />
                <View style={styles.frostVeil} />
              </Animated.View>
            ) : undefined
          }
          // `onPhoto` carries no shadow by design — there is a photo directly
          // behind this pane, and a drop shadow on an image reads as a smudge.
          // The bright top hairline is what separates the two.
          style={[
            styles.sheet,
            {
              minHeight: height - photoHeight + SHEET_RADIUS + SHEET_UNDERHANG,
              // Padding draws the extra glass, the negative margin takes the
              // same distance back out of the content height — so the sheet
              // extends past the end of the page without the page getting any
              // longer. What the bottom rubber band reveals is more sheet.
              paddingBottom: SPACING[8] + tabBarInset + SHEET_UNDERHANG,
              marginBottom: -SHEET_UNDERHANG,
            },
          ]}
        >
          <View style={styles.grabber} />

          <Animated.View entering={FadeInDown.duration(400)}>
            <View style={styles.nameRow}>
              <View style={styles.nameBlock}>
                <Text style={styles.name} numberOfLines={1}>
                  {user.name}
                </Text>
                {user.kyc_status === 'approved' && <VerifiedBadge size={20} />}
                {isPremium(user) && <PremiumBadge size={20} />}
              </View>
              {/* Tertiary (white) — editing your own profile is low-stakes, and
                  the screen's one coral is spent elsewhere. */}
              <Button
                label="Edit Profile"
                variant="tertiary"
                size="sm"
                onPress={() => router.push('/profile/edit')}
              />
            </View>
            {metaBits.length > 0 && (
              <Text style={styles.handle}>{metaBits.join(' · ')}</Text>
            )}
            {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(70).duration(400)}
            style={styles.stats}
          >
            <Stat value={user.events_hosted} label="Hosted" />
            <Stat value={user.events_attended ?? 0} label="Attended" />
            <Stat
              value={user.friends_count}
              label="Friends"
              onPress={() => router.push('/friends')}
            />
            <Stat value={user.thumbs_count ?? 0} label="Thumbs" accent />
          </Animated.View>

          {user.interests.length > 0 && (
            <Animated.View
              entering={FadeInDown.delay(110).duration(400)}
              style={styles.pills}
            >
              {user.interests.map((id) => {
                const a = ACTIVITY_MAP[id];
                if (!a) return null;
                return (
                  <CategoryPill
                    key={id}
                    emoji={a.emoji}
                    label={a.label}
                    color={categoryStyle(id).accent}
                  />
                );
              })}
            </Animated.View>
          )}

          {/* Mello+ status / upsell */}
          <Animated.View entering={FadeInDown.delay(140).duration(400)}>
            <PressableScale
              scaleTo={0.98}
              style={styles.premiumCard}
              onPress={() => router.push('/premium')}
              accessibilityRole="button"
              accessibilityLabel="Mello+"
            >
              {/* Behind the content, and clipped by the card's own radius. */}
              <Animated.View style={[styles.shine, shineStyle]} pointerEvents="none">
                <Svg width={SHINE_WIDTH} height="100%">
                  <Defs>
                    <LinearGradient id="meShine" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor={COLORS.white} stopOpacity={0} />
                      <Stop offset="0.5" stopColor={COLORS.white} stopOpacity={0.32} />
                      <Stop offset="1" stopColor={COLORS.white} stopOpacity={0} />
                    </LinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill="url(#meShine)" />
                </Svg>
              </Animated.View>
              <View style={styles.premiumCardIcon}>
                <Icon
                  name="crown"
                  size={19}
                  color={PREMIUM_GOLD_ON_DARK}
                  strokeWidth={2}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.premiumCardTitle}>
                  {isPremium(user) ? 'Mello+ active' : 'Get Mello+'}
                </Text>
                <Text style={styles.premiumCardSub}>
                  {isPremium(user)
                    ? user.premium_until
                      ? `Until ${new Date(user.premium_until).toLocaleDateString()}`
                      : 'All premium perks unlocked'
                    : 'Whole-city events, filters & unlimited swipes'}
                </Text>
              </View>
              <Icon
                name="chevronRight"
                size={18}
                color={PREMIUM_GOLD_ON_DARK}
              />
            </PressableScale>
          </Animated.View>

          {/* Photos — the whole gallery, including the one on show above, so
              the strip is "your photos" rather than "the rest of them". */}
          {gallery.length > 1 && (
            <Animated.View entering={FadeInDown.delay(170).duration(400)}>
              <Text style={styles.sectionTitle}>Photos</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.bleed}
                contentContainerStyle={styles.photoRow}
              >
                {gallery.map((uri, i) => (
                  <PressableScale
                    key={`${uri}-${i}`}
                    scaleTo={0.96}
                    style={styles.photoTile}
                    onPress={() => openViewer(i)}
                    accessibilityRole="button"
                    accessibilityLabel={`Photo ${i + 1}`}
                  >
                    <Image
                      source={{ uri }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={150}
                    />
                  </PressableScale>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* Opens the whole events block — the hosting hero *and* the
              Upcoming/Attended list under it — the way home's "Your plans"
              heads its featured card plus rows. Unconditional, so the tabs
              still sit under a heading on a profile with nothing hosted.
              Without it the card butted straight onto the photo strip and read
              as one more photo. */}
          <Animated.View entering={FadeInDown.delay(170).duration(400)}>
            <Text style={styles.sectionTitle}>Events</Text>
          </Animated.View>

          {/* The hosting hero. Same card the home screen leads with — it was
              local there until this screen needed it too. */}
          {hosting && (
            <Animated.View entering={FadeInDown.delay(185).duration(400)}>
              <FeaturedPlanCard
                event={hosting}
                preview={previews?.[hosting.id]}
                ended={hasWrapped(hosting)}
                onManage={() =>
                  router.push(
                    hasWrapped(hosting)
                      ? `/events/wrap/${hosting.id}`
                      : `/events/host/${hosting.id}`
                  )
                }
                onShare={() => shareEvent(hosting)}
                onChat={() => router.push(`/chats/event/${hosting.id}`)}
              />
            </Animated.View>
          )}

          {/* Upcoming / Attended */}
          <Animated.View entering={FadeInDown.delay(200).duration(400)}>
            <View style={[styles.tabs, hosting && styles.tabsUnderCard]}>
              <PressableScale scaleTo={0.96} onPress={() => setTab('upcoming')}>
                <Text
                  style={[styles.tab, tab === 'upcoming' && styles.tabActive]}
                >
                  Upcoming
                </Text>
                {tab === 'upcoming' && <View style={styles.tabBar} />}
              </PressableScale>
              <PressableScale scaleTo={0.96} onPress={() => setTab('attended')}>
                <Text
                  style={[styles.tab, tab === 'attended' && styles.tabActive]}
                >
                  Attended
                </Text>
                {tab === 'attended' && <View style={styles.tabBar} />}
              </PressableScale>
            </View>

            {tabRows.length > 0 ? (
              <View style={{ gap: SPACING[2.5] }}>
                {tabRows.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    onDark
                    onPress={() => useUIStore.getState().setSelectedEvent(e.id)}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.tabEmpty}>
                {tab === 'upcoming'
                  ? 'No upcoming plans yet.'
                  : 'Events you have been to will show up here.'}
              </Text>
            )}
          </Animated.View>

          {/* Wishlist: events bookmarked on the swipe deck */}
          {wishlist.length > 0 && (
            <Animated.View entering={FadeInDown.delay(230).duration(400)}>
              <Text style={styles.sectionTitle}>Wishlist</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.bleed}
                contentContainerStyle={styles.wishlistRow}
              >
                {wishlist.map((e) => {
                  const cat = categoryStyle(e.activity);
                  const emoji = ACTIVITY_MAP[e.activity]?.emoji ?? '📍';
                  return (
                    <PressableScale
                      key={e.id}
                      scaleTo={0.96}
                      style={styles.wishCard}
                      onPress={() => useUIStore.getState().setSelectedEvent(e.id)}
                    >
                      <View
                        style={[styles.wishMedia, { backgroundColor: cat.tint }]}
                      >
                        {e.image_url ? (
                          <Image
                            source={{ uri: e.image_url }}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                            transition={150}
                          />
                        ) : (
                          <Text style={styles.wishEmoji}>{emoji}</Text>
                        )}
                        <PressableScale
                          scaleTo={0.85}
                          style={styles.wishRemove}
                          onPress={() => removeSaved.mutate(e.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${e.title} from wishlist`}
                        >
                          <Icon
                            name="close"
                            size={12}
                            color="#fff"
                            strokeWidth={2.6}
                          />
                        </PressableScale>
                      </View>
                      <View style={styles.wishBody}>
                        <Text style={styles.wishTitle} numberOfLines={2}>
                          {e.title}
                        </Text>
                        <Text style={styles.wishTime} numberOfLines={1}>
                          {formatEventWhen(e.starts_at)}
                        </Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </ScrollView>
            </Animated.View>
          )}
        </Glass>
      </Animated.ScrollView>

      {/* Settings, alone in the top-right. Nothing else belongs up here: the
          name is in the sheet a few hundred points below and does not need
          repeating, and Edit Profile now sits next to it.

          It is also what the settings screen flies to its own top-left and
          turns into a back button, so it needs a plain measurable wrapper —
          see useOpenOverlay for why the ref cannot go on PressableScale. */}
      <View
        style={[styles.topBar, { top: insets.top + SPACING[1] }]}
        pointerEvents="box-none"
      >
        <View
          ref={settingsRef}
          collapsable={false}
          style={handedOver === 'settings' && styles.handedOver}
        >
          <PressableScale
            scaleTo={0.9}
            onPress={() => openOverlay('settings', settingsRef)}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Glass tier="onPhoto" radius={23} style={styles.topGlyph}>
              <Icon name="settings" size={20} color={COLORS.white} />
            </Glass>
          </PressableScale>
        </View>
      </View>
      </Animated.View>

      {/* Photo viewer. `transparent` so it dims the profile and opens over it
          rather than cutting to a separate screen — with an opaque modal the
          page underneath is gone, and returning reads as a navigation rather
          than as closing something. */}
      <Modal
        visible={viewerOpen}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setViewerOpen(false)}
      >
        <View style={styles.viewer}>
          <FlatList
            data={gallery}
            horizontal
            pagingEnabled
            initialScrollIndex={viewerIndex}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(uri, i) => `${uri}-${i}`}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            onMomentumScrollEnd={(e) =>
              setViewerIndex(
                Math.round(e.nativeEvent.contentOffset.x / width)
              )
            }
            renderItem={({ item }) => (
              // Tapping the photo closes, the way every lightbox does. The
              // FlatList's pan responder still wins horizontal drags, so this
              // costs no paging.
              <Pressable
                style={[styles.viewerPage, { width }]}
                onPress={() => setViewerOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close photos"
              >
                <Image
                  source={{ uri: item }}
                  style={styles.viewerImage}
                  contentFit="contain"
                  transition={150}
                />
              </Pressable>
            )}
          />
          {/* Insets applied by hand from `useSafeAreaInsets`, NOT SafeAreaView.
              A Modal is its own native window, so the safe-area provider
              measures nothing inside it and SafeAreaView collapses to zero —
              which put this row under the Dynamic Island and made the close
              button unhittable. `insets` is read in the parent tree, where it
              is correct, and works the same on Android. */}
          <View
            style={[styles.viewerTop, { paddingTop: insets.top + SPACING[2] }]}
            pointerEvents="box-none"
          >
            <Text style={styles.viewerCounter}>
              {viewerIndex + 1} / {gallery.length}
            </Text>
            <NavButton
              icon="close"
              color={COLORS.white}
              onPress={() => setViewerOpen(false)}
              accessibilityLabel="Close photos"
            />
          </View>
          {gallery.length > 1 && (
            <View
              style={[
                styles.viewerDots,
                { bottom: insets.bottom + SPACING[6] },
              ]}
              pointerEvents="none"
            >
              {gallery.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.viewerDot,
                    i === viewerIndex && styles.viewerDotActive,
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const FILL = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;

const styles = StyleSheet.create({
  // Opaque, unlike every other tab screen: this one deliberately covers
  // <AppBackground> with the user's own photo. `accent` is the floor for a
  // profile with no photo at all.
  container: { flex: 1, backgroundColor: COLORS.accent },

  // Screen-height, pinned to the screen by `frostStyle`, clipped by the pane.
  frost: { position: 'absolute', top: 0, left: 0, right: 0 },
  // Knocks the frost back so white type stays legible over a bright photo.
  // `inkVeil` (0.28) rather than `scrim` (0.45): the point is for the photo's
  // colour to carry through the glass, and 0.45 kills it.
  frostVeil: { ...FILL, backgroundColor: COLORS.inkVeil },

  // Taller than the photo by PHOTO_BLEED and pulled up by the same amount, so
  // the extra sits off the top of the screen at rest and costs no scroll.
  photoWindow: { marginTop: -PHOTO_BLEED, overflow: 'hidden' },
  // Anchored to the window's *bottom* — the edge that has to stay welded to the
  // sheet. `transformOrigin` keeps it there through the pull-down scale.
  photoInner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    transformOrigin: 'bottom',
  },
  photoFallback: {
    ...FILL,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2.5],
  },
  photoFallbackHint: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textOnDark,
  },
  photoTopFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 },

  // Pulled up so its rounded corners sit over the photo's last SHEET_RADIUS.
  sheet: {
    marginTop: -SHEET_RADIUS,
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[4],
  },
  grabber: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.textOnDarkMuted,
    alignSelf: 'center',
    marginBottom: SPACING[4],
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[3],
  },
  // Takes the slack so a long name truncates instead of shoving the button
  // off the right edge.
  nameBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  name: {
    flexShrink: 1,
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.display,
    // Tight, near the glyph height — the mockup sets 0.94. The default leading
    // on a 34px display face is most of the gap under the name, so this does
    // more of the tightening than the margin below does.
    lineHeight: 36,
    letterSpacing: -1,
    color: COLORS.white,
  },
  handle: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textOnDark,
    marginTop: SPACING[0.5],
  },
  bio: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    lineHeight: 20,
    color: COLORS.textOnDark,
    marginTop: SPACING[3.5],
  },

  stats: { flexDirection: 'row', gap: SPACING[2], marginTop: SPACING[5] },
  statBox: {
    flex: 1,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING[3],
    alignItems: 'center',
    backgroundColor: COLORS.fillOnDark,
    borderWidth: 1,
    borderColor: COLORS.borderOnDark,
  },
  statValue: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.titleLg,
    lineHeight: 26,
    color: COLORS.white,
  },
  statValueAccent: { color: COLORS.primaryLight },
  statLabel: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textOnDarkMuted,
    marginTop: SPACING[1],
  },

  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING[2],
    marginTop: SPACING[5],
  },

  shine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SHINE_WIDTH,
  },
  premiumCard: {
    // Clips the shine to the card's corners.
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    backgroundColor: PREMIUM_GOLD_TINT_ON_DARK,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: PREMIUM_GOLD_BORDER_ON_DARK,
    padding: SPACING[3.5],
    marginTop: SPACING[4],
  },
  premiumCardIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: PREMIUM_GOLD_TINT_ON_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumCardTitle: {
    fontFamily: FONTS.headingBold,
    fontSize: TYPE_SIZE.bodyLg,
    color: COLORS.white,
  },
  premiumCardSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textOnDarkMuted,
    marginTop: SPACING[0.5],
  },

  sectionTitle: {
    fontFamily: FONTS.headingBold,
    fontSize: TYPE_SIZE.sectionLg,
    letterSpacing: -0.3,
    color: COLORS.white,
    marginTop: SPACING[6],
    marginBottom: SPACING[3.5],
  },
  // Horizontal strips run to both screen edges, cancelling the sheet's padding
  // and putting it back inside the scroll so the first card still lines up.
  bleed: { marginHorizontal: -SPACING[5] },
  photoRow: { gap: SPACING[2.5], paddingHorizontal: SPACING[5] },
  photoTile: {
    width: 132,
    height: 168,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderOnDark,
    backgroundColor: COLORS.fillOnDark,
  },

  // No top margin of its own: the "Events" heading above already carries the
  // gap, and the tabs sit directly under whichever of the two came last.
  tabs: {
    flexDirection: 'row',
    gap: SPACING[6],
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderOnDark,
    marginBottom: SPACING[4],
  },
  // Only when the hosting card is between them — otherwise the heading's own
  // margin already spaces the tabs and this would double it.
  tabsUnderCard: { marginTop: SPACING[6] },
  tab: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textOnDarkMuted,
    paddingBottom: SPACING[2.5],
  },
  tabActive: { fontFamily: FONTS.heading, color: COLORS.white },
  tabBar: {
    height: 2.5,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
    marginTop: -2.5,
  },
  tabEmpty: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textOnDarkMuted,
    paddingVertical: SPACING[2.5],
  },

  // `flex-end` rather than `space-between`: the other-user version of this
  // screen adds a back button on the left, and that one wants both.
  topBar: {
    position: 'absolute',
    left: SPACING[5],
    right: SPACING[5],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  // The layer that recedes behind a full-screen overlay. The photo viewer stays
  // outside it — a modal that shrank with the page would not be quite modal.
  fill: { flex: 1 },
  // Not animated, and not a fade: the moment the settings screen exists it owns
  // this chip and is flying it across. Anything in between is a second copy.
  handedOver: { opacity: 0 },
  // 46 with a 23 radius, matching the header chips on the home screen and the
  // back button every overlay lands. A circle's radius is half its width —
  // geometry, not a step on the radius scale, which is why neither is a token.
  topGlyph: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },

  viewer: { flex: 1, backgroundColor: COLORS.lightbox },
  viewerPage: { flex: 1, justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  // paddingTop is applied inline from the safe-area inset — see the note at the
  // call site for why this cannot be a SafeAreaView.
  viewerTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
  },
  viewerCounter: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.white,
  },
  // `bottom` is inline, from the safe-area inset.
  viewerDots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING[1.5],
  },
  viewerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.borderOnDark,
  },
  viewerDotActive: { backgroundColor: COLORS.white },

  wishlistRow: { gap: SPACING[2.5], paddingHorizontal: SPACING[5] },
  wishCard: {
    width: 148,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.fillOnDark,
    borderWidth: 1,
    borderColor: COLORS.borderOnDark,
  },
  wishMedia: { height: 86, alignItems: 'center', justifyContent: 'center' },
  wishEmoji: { fontSize: TYPE_SIZE.display },
  wishRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.glassOnPhotoSolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishBody: { padding: SPACING[2.5], paddingTop: SPACING[2], gap: SPACING[0.5] },
  wishTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 17,
    color: COLORS.white,
  },
  wishTime: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textOnDarkMuted,
  },
});
