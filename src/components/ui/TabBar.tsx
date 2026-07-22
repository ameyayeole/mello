import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Easing as RNEasing,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Glass } from './Glass';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/colors';
import { OVERLAY_TRANSITION } from '@/constants/motion';
import { RADIUS, SPACING } from '@/constants/spacing';

// The tab bar is a floating bar: it sits *over* the screen instead of below
// it, so content passes under the frosted glass. Everything a screen needs in
// order to keep clear of it is derived from these numbers — change one and
// every scroll view's bottom padding follows.
export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_SIDE_INSET = SPACING[4];
// Not `TAB_BAR_HEIGHT / 2`. That is a pill — semicircular ends — and reads as
// a different shape language from the rounded rectangles the rest of the app
// is built from. At ~a third of the height the sides stay visibly straight and
// it sits on the radius scale rather than being a number of its own.
export const TAB_BAR_RADIUS = RADIUS['2xl'];
// Inner padding of the bar. The indicator derives item positions from this, so
// it has to be the same number the tab bar is actually laid out with.
export const TAB_BAR_PADDING_X = SPACING[2];

// The selected chip. Lives here rather than in the layout because two things
// need to agree on it: the indicator drawn on the glass, and the icon box the
// glyphs are centred in.
export const CHIP_WIDTH = 52;
export const CHIP_HEIGHT = 46;
export const CHIP_RADIUS = RADIUS.lg;

// Motion for the indicator. Quick enough to keep up with a tap, loose enough to
// arrive rather than stop: the spring overshoots slightly, and the stretch runs
// shorter on the way out than the way back so the deformation leads the travel.
const GLIDE = { stiffness: 190, damping: 19, mass: 0.85 } as const;
const STRETCH_IN_MS = 90;
const STRETCH_OUT_MS = 170;
const STRETCH_X = 0.34;
const SQUASH_Y = 0.14;
// Floor for hardware that reports no bottom inset at all (older iPhones,
// Android with hardware keys), where the inset alone would weld the bar to the
// screen edge.
const MIN_BOTTOM_GAP = SPACING[4];

// How much of the safe-area inset the bar is allowed to sit inside.
//
// The inset is deliberately generous — it is the home indicator *plus* padding,
// sized for content running flush to the glass. A bar that already floats clear
// of all four edges reads as stranded at the full 34pt, which is why the
// reference apps all sit slightly inside it.
//
// 8pt is chosen so the bar's lower edge still clears the home indicator itself
// by ~13pt on current iOS hardware. An earlier version took 20pt and put the
// bar *inside* the indicator's gesture area; this constant is small, bounded
// and floored precisely so that cannot happen again.
const INSET_TIGHTEN = SPACING[2];

/**
 * Gap between the bottom of the bar and the bottom of the screen.
 *
 * Derived from the safe-area inset, because that is the only device-independent
 * answer to "where does the usable screen end": 34pt on a home-indicator
 * iPhone, 0 on an iPhone SE, 16–48 on Android depending on gesture vs button
 * navigation.
 *
 * Measured against the nearest obstacle rather than the glass, this lands very
 * close on both extremes — ~13pt above the home indicator on a modern iPhone,
 * 16pt above the bezel on an SE — which is what makes it read as the same
 * design on every device rather than merely the same number.
 */
function bottomGap(bottomInset: number) {
  return Math.max(bottomInset - INSET_TIGHTEN, MIN_BOTTOM_GAP);
}

export function useTabBarBottomMargin() {
  const { bottom } = useSafeAreaInsets();
  return bottomGap(bottom);
}

/**
 * Horizontal margin. Adds the left/right insets so the bar keeps the same
 * visual gap from the screen edge in landscape on a notched device, where
 * those insets are non-zero.
 */
export function useTabBarSideMargin() {
  const { left, right } = useSafeAreaInsets();
  return TAB_BAR_SIDE_INSET + Math.max(left, right);
}

/**
 * Bottom padding a screen inside `(tabs)` needs so its last row clears the
 * floating tab bar. Nothing reserves this space automatically: the bar is
 * absolutely positioned, so a scroll view without it just ends under the glass.
 */
export function useTabBarInset() {
  const { bottom } = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + bottomGap(bottom) + SPACING[3];
}

/**
 * The bar's own exit: it slides down off the bottom of the screen and back,
 * rather than blinking out of existence.
 *
 * Feed it whatever means "something else owns the screen now" — a full-screen
 * overlay, an open chat thread, the in-map create flow — and spread the result
 * into `tabBarStyle`. It times itself against `OVERLAY_TRANSITION.scene*`, the
 * same numbers the page underneath an overlay recedes on, so the whole scene
 * steps back as one movement instead of the bar cutting out mid-transition.
 *
 * ── Why the legacy Animated API, in a Reanimated codebase ───────────────────
 * The view being animated is React Navigation's, not ours, and it reaches us
 * only through the `tabBarStyle` prop. That bar is a `react-native`
 * `Animated.View` — `tabBarStyle` is typed `Animated.WithAnimatedValue<…>`
 * precisely so a value like this can be handed to it — and a Reanimated style
 * means nothing to a view Reanimated does not own. This is the rare case where
 * the old API is the correct tool; everything else in this file is Reanimated.
 *
 * `tabBarStyle` is applied last in the bar's style array, so this `transform`
 * replaces the built-in keyboard-hide one. That is fine: `tabBarHideOnKeyboard`
 * is off, and the two would be describing the same movement anyway.
 *
 * The previous version was `display: 'none'`, which cannot animate at all — the
 * bar vanished in one frame in the middle of an otherwise 500ms transition.
 */
export function useTabBarSlide(hidden: boolean) {
  const bottomMargin = useTabBarBottomMargin();
  // Clear of the bar, the gap under it, and the soft shadow that extends past
  // both — otherwise its lower edge parks just off-screen and the shadow stays
  // visible as a smudge along the bottom.
  const travel = TAB_BAR_HEIGHT + bottomMargin + SPACING[6];

  // 1 = in place, 0 = gone. Seeded from `hidden` rather than always starting at
  // 1: a screen entered with the bar already hidden should find it gone, not
  // watch it slide away.
  const [shown] = useState(() => new RNAnimated.Value(hidden ? 0 : 1));

  useEffect(() => {
    const animation = RNAnimated.timing(shown, {
      toValue: hidden ? 0 : 1,
      // Out immediately, back only once whatever covered it has cleared —
      // see OVERLAY_TRANSITION for why those two are not mirror images.
      delay: hidden ? 0 : OVERLAY_TRANSITION.sceneReturnDelayMs,
      duration: hidden
        ? OVERLAY_TRANSITION.sceneOutMs
        : OVERLAY_TRANSITION.sceneReturnMs,
      easing: RNEasing.out(RNEasing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [hidden, shown]);

  return useMemo(
    () => ({
      transform: [
        {
          translateY: shown.interpolate({
            inputRange: [0, 1],
            outputRange: [travel, 0],
          }),
        },
      ],
    }),
    [shown, travel]
  );
}

// Which tab the pathname belongs to. Longest match wins, so `/chats/dm/x`
// resolves to `/chats` rather than to `/`.
function activeTabIndex(pathname: string, routes: readonly string[]) {
  let best = 0;
  let bestLength = -1;
  routes.forEach((route, index) => {
    const matches =
      route === '/'
        ? pathname === '/'
        : pathname === route || pathname.startsWith(`${route}/`);
    if (matches && route.length > bestLength) {
      best = index;
      bestLength = route.length;
    }
  });
  return best;
}

function indicatorOffset(index: number, itemWidth: number) {
  return index * itemWidth + (itemWidth - CHIP_WIDTH) / 2;
}

/**
 * The selected-tab chip, as one shared element that travels rather than a
 * background that fades in and out per tab — the eye can follow a thing that
 * moves, so the bar reads as one object instead of five.
 *
 * The spring carries it across with a little overshoot. The stretch is what
 * makes it feel like a bubble in water rather than a box on rails: it goes
 * wider and thinner as it leaves, then rounds back out on arrival. Squashing
 * across the direction of travel while stretching along it conserves the
 * apparent volume, which is the whole trick.
 *
 * Reanimated honours the OS "reduce motion" setting on both by default, which
 * collapses this to an instant move.
 */
function TabIndicator({ index, itemWidth }: { index: number; itemWidth: number }) {
  const x = useSharedValue(indicatorOffset(index, itemWidth));
  const stretch = useSharedValue(0);
  // The first pass positions without animating, or the indicator would fly in
  // from the left edge every time the navigator mounts.
  const placed = useRef(false);

  useEffect(() => {
    const target = indicatorOffset(index, itemWidth);
    if (!placed.current) {
      placed.current = true;
      x.value = target;
      return;
    }
    x.value = withSpring(target, GLIDE);
    stretch.value = withSequence(
      withTiming(1, { duration: STRETCH_IN_MS, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: STRETCH_OUT_MS, easing: Easing.inOut(Easing.quad) })
    );
  }, [index, itemWidth, x, stretch]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { scaleX: 1 + stretch.value * STRETCH_X },
      { scaleY: 1 - stretch.value * SQUASH_Y },
    ],
  }));

  return <Animated.View style={[styles.indicator, style]} />;
}

/**
 * Passed to `Tabs` as `tabBarBackground`. React Navigation renders it into an
 * `absoluteFill` wrapper behind the tab items, so this fills its parent — which
 * is also exactly where the indicator wants to be: on the glass, under the
 * glyphs, clipped by the bar's rounded corners.
 *
 * `routes` must be in the same order as the `<Tabs.Screen>` declarations; the
 * indicator's position is derived from the index in that list. It is read from
 * the pathname here rather than passed down, so this re-renders on navigation
 * regardless of how the navigator propagates its options.
 *
 * On Android `BlurView` only blurs real content when it is handed a
 * `BlurTargetView` ref, and the screens we would need to wrap live inside the
 * navigator where `tabBarBackground` can't reach them. With no target it falls
 * back to a semi-transparent fill, which is why the wash below matters: it is
 * the whole effect on Android and a contrast floor on iOS.
 */
export function TabBarBackground({ routes }: { routes: readonly string[] }) {
  const { width } = useWindowDimensions();
  const sideMargin = useTabBarSideMargin();
  const pathname = usePathname();

  // Computed rather than measured. The items are `flex: 1` in a bar whose width
  // is fully determined by the screen and these two constants, so an onLayout
  // pass would only report what we already know — after showing the indicator
  // in the wrong place for a frame.
  const itemWidth =
    (width - 2 * sideMargin - 2 * TAB_BAR_PADDING_X) / routes.length;

  return (
    // `chrome` — the most opaque of the three tiers, because content passes
    // visibly underneath this one. Was a hand-rolled BlurView with its own
    // intensity, wash and border; sharing <Glass> also gets the bar Android's
    // solid fallback, without which it renders as a nearly invisible pane over
    // the new gradient backdrop.
    //
    // No shadow here: React Navigation puts SHADOWS.lg on the tab bar's own
    // style, and this only fills it.
    <Glass
      tier="chrome"
      radius={TAB_BAR_RADIUS}
      shadow={false}
      style={styles.glass}
    >
      <TabIndicator
        index={activeTabIndex(pathname, routes)}
        itemWidth={itemWidth}
      />
    </Glass>
  );
}

const styles = StyleSheet.create({
  // Fill and border come from <Glass>; this is only the box.
  glass: { flex: 1 },
  // `left`/`top` park it in the first slot; `translateX` does the travelling.
  indicator: {
    position: 'absolute',
    left: TAB_BAR_PADDING_X,
    top: (TAB_BAR_HEIGHT - CHIP_HEIGHT) / 2,
    width: CHIP_WIDTH,
    height: CHIP_HEIGHT,
    borderRadius: CHIP_RADIUS,
    backgroundColor: COLORS.inkSubtle,
  },
});
