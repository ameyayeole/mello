import { useCallback, useEffect, useRef } from 'react';
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
 * not part of what moves. So the route is transparent with the native animation
 * off, this component slides only the layer holding the background and the
 * content, and the chip is drawn on top of that layer and never animated at
 * all.
 *
 * The screen underneath stays mounted and is simply covered — which is what
 * gives the sliding layer a hard left edge to travel with, and is why there is
 * no cross-fade of two backgrounds to manage. It also means the chip you can
 * see mid-slide is arguably Settings' own; both are drawn at the same pixel
 * from the same constants, so it does not matter which one you are looking at.
 * That is the whole trick.
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
    // The route pops in the timing callback, not on the tap: with the native
    // animation off, nothing else would play the exit before the screen was
    // torn down.
    slide.value = withTiming(1, EXIT, (done) => {
      if (done) runOnJS(pop)();
    });
  };

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
    slide.value = withTiming(1, EXIT, (done) => {
      if (done) runOnJS(pop)();
    });
  }, [leaving, slide, pop]);

  const layer = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value * width }],
  }));

  // The page behind darkens a little as the panel covers it, so the panel reads
  // as being *in front* rather than as a second page pasted at the same depth.
  // Fades out completely at rest, so it costs nothing once the panel has landed.
  const shade = useAnimatedStyle(() => ({
    opacity: interpolate(slide.value, [0, 1], [0.18, 0]),
  }));

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <Animated.View
        style={[StyleSheet.absoluteFill, shade, styles.shade]}
        pointerEvents="none"
      />

      <Animated.View style={[StyleSheet.absoluteFill, layer]}>
        <AppBackground />
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
  shade: { backgroundColor: COLORS.ink },
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
