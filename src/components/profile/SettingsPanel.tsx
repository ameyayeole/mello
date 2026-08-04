import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { SPACING } from '@/constants/spacing';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { AppBackground } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import {
  CHIP_SIZE,
  SettingsBackChip,
  useChipTop,
} from './settingsChrome';

/**
 * A settings sub-screen: the contents arrive from the right, the back button
 * does not move.
 *
 * These used to be `presentation: 'modal'` — every row on the settings list
 * threw up a card from the bottom edge, which reads as five unrelated
 * interruptions rather than as one place you are moving around inside.
 *
 * The obvious fix, a native `slide_from_right`, does not work here: a native
 * stack slides the *whole* screen, so both screens' back buttons travel and you
 * watch two chips cross in the middle. The button can only hold still if it is
 * not part of what moves.
 *
 * So the route is transparent with the native animation off, and **only the
 * contents move**. Two things deliberately do not:
 *
 *   the chip     drawn on top of the sliding layer, never animated. Settings
 *                draws one too, at the same pixel from the same constants, so
 *                whichever you are looking at mid-slide it has not moved.
 *
 *   the backdrop not painted here at all when Settings is underneath — its
 *                <AppBackground> is the one both screens share. A panel that
 *                brought its own and slid it in was the whole complaint: a
 *                travelling background reads as a second page arriving, rather
 *                than as this page's contents being replaced.
 *
 * Settings slides its own rows out as these arrive (it watches
 * `settingsPanelOpen`), so the two sets of contents change places over a
 * backdrop that is completely still.
 *
 * The exception is Edit profile opened from the Profile tab, where there is no
 * Settings underneath and nothing to be transparent over — hence
 * `settingsRootMounted`, and the fallback backdrop below. It is static too.
 */
export function SettingsPanel({
  title,
  children,
  keyboardAvoiding = false,
  onBack,
  right,
  leaving = false,
}: {
  title: string;
  children: React.ReactNode;
  keyboardAvoiding?: boolean;
  // For a screen that has to intercept leaving — the edit form's discard
  // confirm. Return false to keep the panel open.
  onBack?: () => boolean;
  // An action for this panel, level with the title rather than in a header bar:
  // there is no header bar any more, only the floating chip.
  right?: React.ReactNode;
  // Flip to true to leave by a route other than the chip: the edit form sets it
  // once its discard confirm has decided, and once a save has landed. Declared
  // as a prop rather than handed back as an imperative handle because a ref
  // passed down only to be written to is a prop being mutated, which is what
  // the compiler's immutability rule is there to stop.
  //
  // Deliberately skips the `onBack` guard — whatever set this has already
  // answered the question that guard exists to ask.
  leaving?: boolean;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const chipTop = useChipTop();
  // Read once on mount, not subscribed: whether Settings is below us is fixed
  // for the life of this screen, and re-reading it mid-exit (when Settings has
  // already begun tearing down) would swap the backdrop in under the slide.
  const [hasBackdropBelow] = useState(
    () => useUIStore.getState().settingsRootMounted
  );

  // 1 = parked off the right edge, 0 = home. Expressed as a fraction so it does
  // not have to be re-measured if the window changes mid-flight.
  const slide = useSharedValue(1);
  // Guards a second trigger while the exit is already running, which would
  // otherwise pop the route twice.
  const exiting = useRef(false);

  const pop = useCallback(() => {
    router.back();
  }, [router]);

  // A plain function, not a useCallback, and declared before the effects below —
  // both deliberate. Handing `slide` to a second hook is what turns "start an
  // animation" into "reassign effect state" as far as the compiler's
  // immutability rule is concerned, and the pair is only tolerated in this
  // order. Same shape as useOverlayScreen's `leave`, for the same reason.
  const dismiss = () => {
    if (exiting.current) return;
    if (onBack && !onBack()) return;
    exiting.current = true;
    useUIStore.getState().setSettingsPanelOpen(false);
    // The route pops in the timing callback, not on the tap: with the native
    // animation off, nothing else would play the exit before the screen was
    // torn down.
    slide.value = withTiming(1, EXIT, (done) => {
      if (done) runOnJS(pop)();
    });
  };

  // Tells Settings to move its rows aside. Cleared on unmount as well as on the
  // way out, so a route torn down some other way — a deep link rebuilding the
  // stack, Android's hardware back — doesn't leave Settings parked off-screen.
  useEffect(() => {
    const { setSettingsPanelOpen } = useUIStore.getState();
    setSettingsPanelOpen(true);
    return () => setSettingsPanelOpen(false);
  }, []);

  // Both directions in one effect, not two. `slide` is written here and in
  // `dismiss` above, and that pair is the most the compiler's immutability rule
  // tolerates — a third write site, even in its own effect, reads as effect
  // state being reassigned from outside. Same constraint useOverlayScreen works
  // within.
  useEffect(() => {
    if (!leaving) {
      slide.value = withTiming(0, ENTER);
      return;
    }
    if (exiting.current) return;
    exiting.current = true;
    // Settings starts coming back now rather than when the route finally pops:
    // the two halves have to overlap or they read as two separate animations.
    useUIStore.getState().setSettingsPanelOpen(false);
    slide.value = withTiming(1, EXIT, (done) => {
      if (done) runOnJS(pop)();
    });
  }, [leaving, slide, pop]);

  const layer = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value * width }],
  }));

  // Fades as well as slides, because there is no backdrop of its own to hide
  // what it is crossing — these contents and the Settings rows are both on the
  // one background, so they have to trade places rather than one occluding the
  // other.
  //
  // 0.85 rather than a shorter ramp: fading only over the last stretch left the
  // contents invisible for most of their travel and then arriving in a rush.
  const fade = useAnimatedStyle(() => ({
    opacity: interpolate(slide.value, [0, 0.85], [1, 0], 'clamp'),
  }));

  return (
    <View style={styles.root} pointerEvents="box-none">
      <StatusBar style="dark" />

      {/* Only when there is nothing underneath to be transparent over — see the
          note above. Outside the sliding layer either way: the backdrop is the
          one thing on this screen that must never move. */}
      {!hasBackdropBelow && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <AppBackground />
        </View>
      )}

      <Animated.View style={[StyleSheet.absoluteFill, layer, fade]}>
        <View style={[styles.content, { paddingTop: chipTop + CHIP_SIZE + SPACING[4] }]}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {right}
          </View>
          {keyboardAvoiding ? (
            <KeyboardAvoidingView
              style={styles.fill}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              {children}
            </KeyboardAvoidingView>
          ) : (
            children
          )}
        </View>
      </Animated.View>

      {/* Outside the sliding layer on purpose — see the note above. */}
      <SettingsBackChip onPress={dismiss} />
    </View>
  );
}

// Out is quicker than in. Arriving is the part worth watching; leaving should
// get out of the way, and an exit that takes as long as the entrance is what
// makes a back tap feel unresponsive.
const ENTER = { duration: 320, easing: Easing.out(Easing.cubic) } as const;
const EXIT = { duration: 240, easing: Easing.in(Easing.cubic) } as const;

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  content: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[3],
    paddingHorizontal: SPACING[5],
    marginBottom: SPACING[3],
  },
  title: {
    flex: 1,
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.display,
    lineHeight: 40,
    letterSpacing: -1,
    color: COLORS.textPrimary,
  },
});
