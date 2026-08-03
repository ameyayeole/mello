import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { RADIUS, SPACING } from '@/constants/spacing';
import { useRenderCount } from '@/hooks/useRenderCount';

// A picker wheel, in the shape of the system timer: a column of options
// scrolling under a fixed selection band. Duration, date and time are the same
// interaction, so they are the same component rather than three that drift.
//
// Generic over the value, driven by a list of {value,label} — it knows nothing
// about what it is choosing.
export const WHEEL_ITEM_H = 48;
const WHEEL_VISIBLE = 5;
export const WHEEL_H = WHEEL_ITEM_H * WHEEL_VISIBLE;

// Milliseconds between haptic ticks. A hard flick crosses rows faster than the
// haptic engine can answer, and every crossing is a hop to the JS thread —
// unthrottled it both stutters the scroll and blurs into one long buzz. 45ms
// keeps a slow scroll ticking per row and a fast spin ticking steadily.
const TICK_MS = 45;

// One row of the drum.
function WheelRow({
  label,
  index,
  scrollY,
}: {
  label: string;
  index: number;
  scrollY: SharedValue<number>;
}) {
  // Signed distance from the band, in rows: negative below it, positive above.
  // Rows do not merely shrink as they leave — they rotate away from the viewer,
  // which is the system picker's actual signature and the difference between a
  // drum turning and a list with one item highlighted.
  const style = useAnimatedStyle(() => {
    const d = scrollY.value / WHEEL_ITEM_H - index;
    const a = Math.abs(d);
    return {
      opacity: interpolate(a, [0, 1, 2, 3], [1, 0.55, 0.25, 0.08], Extrapolation.CLAMP),
      transform: [
        // Perspective has to lead the list, or the rotation flattens into a
        // vertical squash instead of reading as a turn into the screen.
        { perspective: 620 },
        {
          rotateX: `${interpolate(d, [-3, 0, 3], [-62, 0, 62], Extrapolation.CLAMP)}deg`,
        },
        { scale: interpolate(a, [0, 1, 2.5], [1, 0.9, 0.78], Extrapolation.CLAMP) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.item, style]}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

export function Wheel<T extends string | number>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  // The option count is in the name on purpose: it is the number the windowing
  // fix is measured against. The Starts sheet mounts two of these, 90 and 48.
  useRenderCount(`Wheel(${options.length})`);
  // Opening scrolled to the current value is most of the point of a wheel — it
  // shows where you sit in the range, not just what you picked.
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  // Drives the per-row falloff. Seeded so rows are styled correctly on the
  // first frame, before any scrolling has happened.
  const scrollY = useSharedValue(index * WHEEL_ITEM_H);
  // Which row is under the band right now, as the finger moves. Separate from
  // `value`, which only commits when the scroll comes to rest.
  const passing = useSharedValue(index);
  const lastTick = useSharedValue(0);

  // The tick that makes it feel like a wheel and not a list. A real picker
  // clicks once per row as it goes past, so the feedback is continuous with the
  // gesture rather than arriving after it.
  const tick = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
    const i = Math.round(e.contentOffset.y / WHEEL_ITEM_H);
    if (i === passing.value) return;
    passing.value = i;
    const now = Date.now();
    if (now - lastTick.value < TICK_MS) return;
    lastTick.value = now;
    runOnJS(tick)();
  });

  // Snapping is the platform's. It decelerates into the row rather than cutting
  // to it, and it is the thing an iOS picker actually does — a hand-rolled
  // scrollTo on top of momentum fought the momentum, and its "am I the one
  // scrolling" guard could strand itself and swallow the next gesture.
  function commit(y: number) {
    const i = Math.min(options.length - 1, Math.max(0, Math.round(y / WHEEL_ITEM_H)));
    const next = options[i]?.value;
    if (next !== undefined && next !== value) onChange(next);
  }

  return (
    <View style={[styles.wrap, style]}>
      {/* Behind the list and never moving; the labels travel under it. Behind,
          so it cannot intercept the drag. */}
      <View style={styles.band} pointerEvents="none" />
      <Animated.ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: index * WHEEL_ITEM_H }}
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => commit(e.nativeEvent.contentOffset.y)}
        // A slow drag that never builds momentum gets no momentum-end at all.
        onScrollEndDrag={(e) => commit(e.nativeEvent.contentOffset.y)}
      >
        {options.map((o, i) => (
          <WheelRow
            key={String(o.value)}
            label={o.label}
            index={i}
            scrollY={scrollY}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: WHEEL_H, marginVertical: SPACING[3] },
  // Explicit height. Without it the ScrollView sizes to its content, lays every
  // row out and has nothing left to scroll — which is exactly how it shipped.
  scroll: { height: WHEEL_H },
  // Half a viewport of padding at each end, so the first and last rows can
  // reach the centre band instead of stopping at the edge.
  content: { paddingVertical: (WHEEL_H - WHEEL_ITEM_H) / 2 },
  item: { height: WHEEL_ITEM_H, justifyContent: 'center' },
  // Filled, not outlined. The outline rule is for inputs; this is not one, it is
  // the system picker's selected row, and that is a soft filled pill. An outline
  // here reads as a field the numbers happen to be passing through.
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: (WHEEL_H - WHEEL_ITEM_H) / 2,
    height: WHEEL_ITEM_H,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.inkFaint,
  },
  // One style for every row. Emphasis comes from the scroll-driven scale and
  // opacity, not from swapping the selected row's font — which was what made
  // the column jump as a value passed under the band.
  label: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
});
