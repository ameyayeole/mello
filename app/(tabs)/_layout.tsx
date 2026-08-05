import { useEffect, useState } from 'react';
import { SHADOWS, SPACING } from '@/constants/spacing';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { View, Text, StyleSheet, Animated as RNAnimated } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { useAuthStore } from '@/stores/authStore';
import {
  AppBackground,
  TabGlyph,
  Avatar,
  TabBarBackground,
  activeTabIndex,
  useDarkTabBarProgress,
  useTabBarBottomMargin,
  useTabBarItemWidth,
  useTabBarSideMargin,
  useTabBarTransform,
  type TabBarTransform,
  CHIP_HEIGHT,
  CHIP_WIDTH,
  TAB_BAR_HEIGHT,
  TAB_BAR_PADDING_X,
  TAB_BAR_RADIUS,
} from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import { useUnreadDms } from '@/hooks/useUnreadDms';
import { SafetyPopup, SosModal, WelcomeSafetyModal } from '@/components/safety';
import { hasSeenSafetyFlag, markSafetyFlagSeen } from '@/services/safety';
import { sharePlan } from '@/utils/sharePlan';

// Safety popup #1: full-screen welcome shown once ever, the first time a
// signed-in user lands in the app after onboarding. "Read the Safety Centre"
// opens the SOS/helplines screen (the closest thing to a Safety Centre today).
function WelcomeSafetyPopup() {
  const userId = useAuthStore((s) => s.user?.id);
  const [visible, setVisible] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    hasSeenSafetyFlag(userId, 'welcome').then((seen) => {
      if (!cancelled && !seen) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function dismiss() {
    setVisible(false);
    if (userId) markSafetyFlagSeen(userId, 'welcome');
  }

  return (
    <>
      <WelcomeSafetyModal
        visible={visible}
        onDone={dismiss}
        onSafetyCentre={() => {
          dismiss();
          setSosOpen(true);
        }}
      />
      <SosModal visible={sosOpen} onClose={() => setSosOpen(false)} />
    </>
  );
}

// Safety popup #4: "Meeting in real life" sheet, opened when the user taps the
// 2-hours-before local notification (set in uiStore by useNotifications).
function EventReminderSheet() {
  const reminderEvent = useUIStore((s) => s.safetyReminderEvent);
  const clear = useUIStore((s) => s.setSafetyReminderEvent);

  if (!reminderEvent) return null;
  return (
    <SafetyPopup
      visible
      icon="location"
      title={`Heading to ${reminderEvent.title} soon?`}
      body={[
        'Share your plan with a trusted contact.',
        'Arrange your own way there and back.',
        'Keep an eye on your drink and your belongings.',
      ]}
      primaryLabel="Share my plan"
      onPrimary={() => {
        sharePlan(reminderEvent);
        clear(null);
      }}
      secondaryLabel="I'm good"
      onSecondary={() => clear(null)}
      onClose={() => clear(null)}
    />
  );
}

// Must stay in the same order as the <Tabs.Screen> declarations below: the
// indicator derives which slot to sit in from a route's index in this list.
const TAB_ROUTES = ['/', '/community', '/map', '/chats', '/profile'] as const;

// ─── Swipe between tabs ─────────────────────────────────────────────────────
// Distance OR velocity — a slow deliberate drag and a quick flick should both
// count, and requiring both makes the flick feel ignored.
const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 450;

// Tabs whose content owns horizontal dragging, where claiming the gesture would
// break the screen rather than add to it. The map pans in both axes, so there
// is no spare horizontal drag for us to take.
const SWIPE_EXCLUDED: readonly string[] = ['/map'];

/**
 * Instagram-style lateral navigation: a horizontal swipe anywhere on the screen
 * moves to the neighbouring tab. Discrete, not a dragged pager — the navigator's
 * own `shift` animation plays the transition, so the swipe picks the
 * destination and the motion already configured above carries it.
 *
 * Only on a tab's *own* root (pathname exactly a route), never a screen pushed
 * on top of one: a horizontal drag inside a DM thread or a nested list already
 * means something there, and taking it to change tabs would be a trap.
 *
 * `failOffsetY` is what lets this coexist with the vertical lists on every tab —
 * the pan gives up as soon as a drag looks vertical, so scrolling never has to
 * win a race against it.
 */
function useTabSwipe() {
  const pathname = usePathname();
  const router = useRouter();

  const index = TAB_ROUTES.indexOf(pathname as (typeof TAB_ROUTES)[number]);
  const enabled = index >= 0 && !SWIPE_EXCLUDED.includes(TAB_ROUTES[index]);

  function go(direction: 1 | -1) {
    const next = index + direction;
    // No wrap-around: the ends are ends. A swipe off the edge should feel like
    // nothing happened, not teleport across the whole bar.
    if (next < 0 || next >= TAB_ROUTES.length) return;
    Haptics.selectionAsync();
    router.push(TAB_ROUTES[next]);
  }

  return Gesture.Pan()
    .enabled(enabled)
    // Claim the gesture only once it is clearly horizontal; abandon it the
    // moment it looks vertical.
    .activeOffsetX([-30, 30])
    .failOffsetY([-20, 20])
    .onEnd((e) => {
      'worklet';
      // Swiping left (finger travels left) brings in the tab to the right, the
      // way every paged interface does it.
      if (e.translationX <= -SWIPE_DISTANCE || e.velocityX <= -SWIPE_VELOCITY) {
        runOnJS(go)(1);
      } else if (
        e.translationX >= SWIPE_DISTANCE ||
        e.velocityX >= SWIPE_VELOCITY
      ) {
        runOnJS(go)(-1);
      }
    });
}

// The quick scale-pop an icon does as the picked-up puck arrives over it, so
// the tab you're about to land on lifts to meet you. Springs back on release.
const HOVER_POP = 1.16;
const HOVER_SPRING = { stiffness: 260, damping: 18, mass: 0.7 } as const;

function useHoverPop(hovered: boolean) {
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withSpring(hovered ? 1 : 0, HOVER_SPRING);
  }, [hovered, pop]);
  return useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.value * (HOVER_POP - 1) }],
  }));
}

// The glyph and its badge only. Selection is drawn by the single travelling
// indicator on the glass behind these — see TabBarBackground.
//
// Every icon, not just Profile's, needs to retint: when the bar itself goes
// black over Profile, all five items are sitting on that dark glass. Two
// copies of the glyph are cross-faded by opacity rather than swapping a color
// prop outright — Solar's icon components aren't Reanimated-aware, so opacity
// on two pre-tinted copies is what actually animates.
function TabIcon({
  name,
  focused,
  badge,
  isProfileScreen,
  hovered = false,
}: {
  name: 'home' | 'community' | 'map' | 'inbox';
  focused: boolean;
  badge?: number;
  isProfileScreen: boolean;
  // True while the picked-up puck is over this tab — see useHoverPop.
  hovered?: boolean;
}) {
  const progress = useDarkTabBarProgress(isProfileScreen);
  const darkToneStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const lightToneStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const popStyle = useHoverPop(hovered);

  return (
    <View style={styles.iconBox}>
      <Animated.View style={[styles.glyphLayer, popStyle]}>
        <Animated.View style={[styles.glyphLayer, darkToneStyle]}>
          <TabGlyph name={name} active={focused} tone="dark" />
        </Animated.View>
        <Animated.View style={[styles.glyphLayer, lightToneStyle]}>
          <TabGlyph name={name} active={focused} tone="light" />
        </Animated.View>
      </Animated.View>
      {!!badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </View>
  );
}

function InboxTabIcon({
  focused,
  isProfileScreen,
  hovered = false,
}: {
  focused: boolean;
  isProfileScreen: boolean;
  hovered?: boolean;
}) {
  const unread = useUnreadDms();
  return (
    <TabIcon
      name="inbox"
      focused={focused}
      badge={unread}
      isProfileScreen={isProfileScreen}
      hovered={hovered}
    />
  );
}

// The ring sits *inside* the same 30px footprint the plain avatar already
// uses elsewhere in the bar, rather than adding to it — so Profile's icon
// never reads as bigger than the other four. The photo shrinks to 24px
// (scale 0.8) to make room: 24px photo, 1px gap, 2px ring stroke, 30px total.
const AVATAR_SIZE = 30;
const AVATAR_RING_SCALE = 24 / AVATAR_SIZE;

function ProfileTabIcon({
  isProfileScreen,
  hovered = false,
}: {
  isProfileScreen: boolean;
  hovered?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const progress = useDarkTabBarProgress(isProfileScreen);
  // Both driven by the same progress as the bar/icon cross-fade, so the photo
  // shrinking and the ring fading in read as one movement, not two.
  const avatarStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 - progress.value * (1 - AVATAR_RING_SCALE) },
    ],
  }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const popStyle = useHoverPop(hovered);
  return (
    <View style={styles.avatarWrap}>
      <Animated.View style={[styles.avatarRingBox, popStyle]}>
        <Animated.View style={avatarStyle}>
          <Avatar name={user?.name} photoUrl={user?.photo_url} size={AVATAR_SIZE} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.avatarRing, ringStyle]} />
      </Animated.View>
    </View>
  );
}

// How long a still press must hold before the bar "wakes" into scrub mode.
const PICKUP_HOLD_MS = 280;

/**
 * One shared drag surface over the whole bar, rendered as a sibling *above*
 * `<Tabs>` so it physically intercepts touches before the native tab buttons
 * underneath do.
 *
 * Three behaviours off the one surface:
 *   • tap            → navigate to the tab under the finger.
 *   • quick drag     → scrub the indicator, navigate on release. No grow.
 *   • long-press     → the bar "wakes": grows/lifts (see `useTabBarPickup`),
 *                      haptic thud, chip becomes a grabbed puck; scrubbing
 *                      ticks per tab; release navigates and the bar settles.
 *
 * While the finger is down only `dragIndex` (state in `TabLayout`) changes —
 * that drives the indicator preview — so crossing three tabs on the way to a
 * fourth never mounts them; only the one you release on does.
 */
function TabBarDragOverlay({
  setDragIndex,
  setPickedUp,
  barTransform,
}: {
  setDragIndex: (index: number | null) => void;
  setPickedUp: (up: boolean) => void;
  barTransform: TabBarTransform;
}) {
  const bottomMargin = useTabBarBottomMargin();
  const sideMargin = useTabBarSideMargin();
  const itemWidth = useTabBarItemWidth(TAB_ROUTES.length);
  const pathname = usePathname();
  const router = useRouter();

  // Picked-up state and the last-hovered tab live on the UI thread as shared
  // values so the gesture worklets can read and compare them without hopping
  // to JS on every frame — only the actual side effects (state, navigation,
  // haptics) cross over via runOnJS. `routeCount` is captured as a plain number
  // because a worklet can't reach into the module-scope array.
  const pickedSV = useSharedValue(0);
  const lastHoverSV = useSharedValue(-1);
  const routeCount = TAB_ROUTES.length;

  // JS-thread side effects. None of these read refs or touch the worklet
  // scope, so they're safe to call via runOnJS.
  function preview(index: number) {
    setDragIndex(index);
  }
  function navigateTo(index: number) {
    setDragIndex(null);
    if (index !== activeTabIndex(pathname, TAB_ROUTES)) {
      router.push(TAB_ROUTES[index]);
    }
  }
  function clearPreview() {
    setDragIndex(null);
  }
  function wake() {
    setPickedUp(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
  function settle() {
    setPickedUp(false);
  }
  function tick() {
    Haptics.selectionAsync();
  }

  // Touch x → tab index, inlined as a worklet so it runs on the UI thread
  // alongside the gesture (calling the JS helper synchronously from a worklet
  // is what threw the earlier "non-worklet function on the UI thread" error).
  function clampIndex(x: number) {
    'worklet';
    const raw = (x - TAB_BAR_PADDING_X) / itemWidth;
    return Math.min(routeCount - 1, Math.max(0, Math.floor(raw)));
  }

  // Tap and drag are two gestures, not one. A bare Pan doesn't reliably enter
  // its ACTIVE state on a stationary press — `onEnd` comes back
  // `success: false` — so a plain tap navigated nowhere. The Tap handles that
  // case; the Pan handles a real drag and previews the indicator as the finger
  // moves.
  const tap = Gesture.Tap()
    // A slow, deliberate press is still a tap — don't let the default 500ms
    // cap drop it on the floor.
    .maxDuration(2000)
    .onEnd((event) => {
      runOnJS(navigateTo)(clampIndex(event.x));
    });

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      const index = clampIndex(event.x);
      runOnJS(preview)(index);
      // A light tick each time the puck crosses into a new tab — but only
      // while picked up, so a quick silent drag stays silent.
      if (pickedSV.value === 1 && index !== lastHoverSV.value) {
        lastHoverSV.value = index;
        runOnJS(tick)();
      }
    })
    .onEnd((event, success) => {
      if (!success) {
        runOnJS(clearPreview)();
        return;
      }
      runOnJS(navigateTo)(clampIndex(event.x));
    });

  // Runs *alongside* tap/drag (Simultaneous) purely to drive the "picked up"
  // visual + haptics — navigation stays owned by tap/pan, so there's no double
  // fire. `maxDistance` gates it to a genuine still hold: move too far before
  // the hold completes (a quick drag) and it fails, no grow. `onFinalize`
  // fires on every end, activated or not, so the reset always runs.
  const longPress = Gesture.LongPress()
    .minDuration(PICKUP_HOLD_MS)
    .maxDistance(28)
    .onStart((event) => {
      pickedSV.value = 1;
      lastHoverSV.value = clampIndex(event.x);
      runOnJS(wake)();
    })
    .onFinalize(() => {
      pickedSV.value = 0;
      runOnJS(settle)();
    });

  // Priority within the tap/drag pair: the drag wins if the finger moves,
  // otherwise the tap fires once the pan has failed to activate. The long-press
  // runs in parallel with both.
  const gesture = Gesture.Simultaneous(Gesture.Exclusive(pan, tap), longPress);

  return (
    <GestureDetector gesture={gesture}>
      {/* Legacy `Animated.View`, not Reanimated's — `barTransform` carries
          react-native Animated interpolations (they feed `tabBarStyle`, a
          legacy Animated.View, which a Reanimated value can't drive). Scaled
          identically to the real bar so this touch target stays aligned as it
          grows. */}
      <RNAnimated.View
        // Not itself an accessibility element — VoiceOver/TalkBack own raw
        // touch while active anyway, and this has no content of its own; the
        // native tab buttons underneath still carry the real labels/roles.
        accessible={false}
        style={[
          styles.dragOverlay,
          { height: TAB_BAR_HEIGHT, marginHorizontal: sideMargin, marginBottom: bottomMargin },
          { transform: barTransform },
        ]}
      />
    </GestureDetector>
  );
}

export default function TabLayout() {
  // The in-map event creation flow takes the whole screen: the tab bar steps
  // aside with the rest of the chrome until the flow closes.
  const creatingEvent = useUIStore((s) => s.creatingEvent);
  const bottomMargin = useTabBarBottomMargin();
  const sideMargin = useTabBarSideMargin();

  // An open conversation is a focused view: with the bar floating over the
  // content it would otherwise sit on top of the composer. `/chats` itself is
  // the list and keeps the bar — anything deeper is a thread. `usePathname`
  // strips the `(tabs)` group, so these are `/chats/<eventId>` and
  // `/chats/dm/<friendId>`.
  const pathname = usePathname();
  const inConversation = pathname.startsWith('/chats/');
  // Read once here rather than in each tab icon, so every icon (and the ring,
  // and the bar itself in TabBarBackground) cross-fades on the same trigger
  // instead of five components independently watching the route.
  const isProfileScreen = pathname === '/profile';

  // The full-screen overlays — notifications, search — are *transparent*
  // routes, so unlike every other push the bar would otherwise still be sitting
  // there: visible but inert, since the screen above swallows the touches.
  const overlayOpen = useUIStore((s) => s.overlayOpen);
  // The map's event deck expands to fill the screen from inside this tree, so
  // the bar steps aside for it the same way it does for the create flow. That
  // is what buys the deck its parked fan tucking BEHIND the bar: it can live
  // below the bar and still be unobstructed when open.
  const deckExpanded = useUIStore((s) => s.deckExpanded);
  const hidden = creatingEvent || inConversation || overlayOpen || deckExpanded;

  // Live index while a finger is down on TabBarDragOverlay; null the rest of
  // the time, when the indicator just follows the route as usual.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // True while the bar is long-press "picked up" (scrub mode).
  const [pickedUp, setPickedUp] = useState(false);

  // The bar's full transform: the hide/show slide with the pickup swell+lift on
  // top. Shared between the real bar (tabBarStyle) and the invisible drag
  // overlay so they grow and hide as one piece.
  const barTransform = useTabBarTransform(hidden, pickedUp);

  const tabSwipe = useTabSwipe();

  return (
    <>
    {/* One instance for the whole tab navigator, not one per screen. The
        backdrop is a single continuous surface the screens slide over — mounted
        per screen, its drifting blobs would jump back to their start position
        on every tab change, and you would be paying for five of them. */}
    <AppBackground />
    <WelcomeSafetyPopup />
    <EventReminderSheet />
    {/* Wraps only the navigator, so the swipe covers the screens without also
        sitting under the drag overlay that owns the tab bar's own gestures. */}
    <GestureDetector gesture={tabSwipe}>
    <View style={styles.tabsHost}>
    <Tabs
      screenOptions={{
        headerShown: false,
        // Without this each screen paints an opaque background over the one
        // above and no glass has anything to be translucent over.
        sceneStyle: { backgroundColor: 'transparent' },
        // Screens cross-fade with a small lateral shift toward the tab you
        // came from. 150ms default: enough to read as motion, short enough
        // that it never sits between you and the content.
        //
        // `sceneStyle` is transparent, so both scenes are painted for the
        // transition's duration and an incoming screen that does heavy work on
        // mount can leave the shift reading badly. The windowing on the message
        // list in chats/[eventId] is there for that reason.
        //
        // What this animation does *not* do is unpaint the tab you left — see
        // the map's own `animation` below, which is the one route that cannot
        // rely on it.
        //
        // `freezeOnBlur` was tried and made it read worse — it suspends a
        // blurred screen's rendering without unpainting it, so the map stopped
        // updating and froze on its last frame, still visible and now visibly
        // stuck.
        animation: 'shift',
        tabBarShowLabel: false,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.placeholder,
        tabBarBackground: () => (
          <TabBarBackground
            routes={TAB_ROUTES}
            dragIndex={dragIndex}
            pickedUp={pickedUp}
          />
        ),
        // React Navigation renders the icon into a fixed 31x28 box, inside a
        // button that is `justifyContent: 'flex-start'` with 5pt of padding —
        // room it reserves for the label even when the label is hidden. That
        // parks every glyph 13pt above the bar's centre line. `flex: 1` makes
        // the icon box fill the button's content height instead, so the chip
        // is centred on the bar rather than pinned to its top edge.
        tabBarIconStyle: { flex: 1, width: CHIP_WIDTH },
        // A floating pill, not a bar welded to the bottom edge: absolute so the
        // screen runs full height and its content passes under the glass.
        // `marginHorizontal`/`marginBottom` rather than left/right/bottom
        // because React Navigation already pins start/end/bottom to 0, and
        // `start`/`end` beat `left`/`right` in Yoga.
        tabBarStyle: {
          position: 'absolute',
          marginHorizontal: sideMargin,
          marginBottom: bottomMargin,
          height: TAB_BAR_HEIGHT,
          paddingTop: 0,
          paddingBottom: 0,
          paddingHorizontal: TAB_BAR_PADDING_X,
          borderTopWidth: 0,
          borderRadius: TAB_BAR_RADIUS,
          // Transparent so the blur shows through — which also means Android
          // draws no elevation shadow here. The hairline edge on the glass is
          // what separates the pill from the content there.
          backgroundColor: 'transparent',
          ...SHADOWS.lg,
          // Last, so this transform wins over the bar's built-in one. Carries
          // both the hide/show slide and the long-press pickup swell — see
          // useTabBarTransform.
          transform: barTransform,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name="home"
              focused={focused}
              isProfileScreen={isProfileScreen}
              hovered={pickedUp && dragIndex === 0}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name="community"
              focused={focused}
              isProfileScreen={isProfileScreen}
              hovered={pickedUp && dragIndex === 1}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          // The one tab that does not cross-fade, and this is load-bearing
          // rather than taste.
          //
          // `shift` does not detach the screen you left: react-navigation keeps
          // it mounted and animates it to `opacity: 0`, and only hands
          // react-native-screens `activityState: 0` — an actual detach — when
          // the blurred route's progress reaches +1, i.e. when you move to a tab
          // on its *left*. Going right (Map index 2 → Inbox index 3) the
          // progress runs to -1, which the activityState interpolation
          // extrapolates as "still transitioning", so the map stays attached
          // forever with nothing but that animated opacity hiding it.
          //
          // Opening a chat from a dealt card is exactly that navigation, and
          // when the opacity does not land the map is left painted, shifted the
          // 50pt the shift's transform ended on — showing through the
          // conversation, which is transparent all the way down to the
          // navigator (chats/_layout, plus `sceneStyle` above). That is the
          // stuck map behind a working, typeable chat.
          //
          // With `animation: 'none'` this route's activityState is the plain
          // constant `STATE_INACTIVE` whenever it is blurred — a value React
          // commits, not one an animation has to arrive at — so the scene is
          // removed instead of faded. Nothing to stall, nothing for a later
          // commit to clobber. It costs the map its own 150ms fade; the other
          // four tabs keep theirs. Leaving a native MKMapView to be hidden by
          // an animated opacity is the part that was never safe.
          animation: 'none',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name="map"
              focused={focused}
              isProfileScreen={isProfileScreen}
              hovered={pickedUp && dragIndex === 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ focused }) => (
            <InboxTabIcon
              focused={focused}
              isProfileScreen={isProfileScreen}
              hovered={pickedUp && dragIndex === 3}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: () => (
            <ProfileTabIcon
              isProfileScreen={isProfileScreen}
              hovered={pickedUp && dragIndex === 4}
            />
          ),
        }}
      />
    </Tabs>
    </View>
    </GestureDetector>
    <TabBarDragOverlay
      setDragIndex={setDragIndex}
      setPickedUp={setPickedUp}
      barTransform={barTransform}
    />
    </>
  );
}

const styles = StyleSheet.create({
  // GestureDetector attaches to a real view, so the navigator gets a host to
  // fill. The tab bar is absolute *within* the navigator, so this doesn't move.
  tabsHost: { flex: 1 },
  iconBox: {
    width: CHIP_WIDTH,
    height: CHIP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The two tone copies of the glyph stack exactly on top of each other and
  // cross-fade; each needs its own centering since position: absolute takes
  // them out of iconBox's flex flow.
  glyphLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sits on the glyph's top-right corner, inside the chip's bounds so it does
  // not shift when the chip appears.
  badge: {
    position: 'absolute',
    top: 4,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: SPACING[1],
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    lineHeight: 13,
    color: COLORS.white,
  },
  avatarWrap: {
    borderRadius: 999,
    padding: SPACING[0.5],
  },
  avatarRingBox: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  // Same 30px footprint as the plain avatar elsewhere in the bar — the photo
  // (see AVATAR_RING_SCALE) shrinks to leave room for this rather than the
  // ring adding to the outer size.
  avatarRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  // Invisible — the real bar underneath still does all the painting. Mirrors
  // that bar's own position/margins exactly (React Navigation pins its
  // start/end/bottom to 0 the same way) so the two frames line up pixel for
  // pixel; `slide` keeps them moving together when the real bar hides.
  dragOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: TAB_BAR_RADIUS,
  },
});
