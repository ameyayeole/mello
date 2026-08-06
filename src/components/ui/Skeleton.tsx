import { createContext, useContext, useEffect, useId, useState } from 'react';
import { View, StyleSheet, type DimensionValue } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { themedStyles } from '@/theme';

// A grey shape of the content that is coming, with a light sweeping across it.
//
// Two exports, and the split is the whole design: `SkeletonGroup` owns the clock
// and `SkeletonBone` owns a shape. A chats list is 8 rows of 4 bones — 32 bones
// running one animation, because they share the group's shared value. Each bone
// starting its own `withRepeat` would be 32 drivers, and they would drift out of
// phase within a few seconds, which reads as static rather than as a sweep.
//
// The shapes built from these live in `src/components/skeletons/`.

// How long one sweep takes, end to end. Slow enough to read as a considered
// loading state rather than a barber's pole.
const SWEEP_MS = 1200;

// The width of the sheen band, as a multiple of the bone it crosses. Wider than
// the bone so a short bone still gets a gradient across it rather than a hard
// edge; the band is clipped by the bone's own `overflow: 'hidden'`.
const BAND_SCALE = 0.7;
const MIN_BAND = 80;

/**
 * 0 → 1, once every `SWEEP_MS`, shared by every bone under the group.
 *
 * `null` means "no clock": either the group is absent (a bone rendered on its own
 * — degrade to static grey rather than crash a screen), or the device asks for
 * reduced motion.
 */
const SkeletonClock = createContext<SharedValue<number> | null>(null);

export function SkeletonGroup({ children }: { children: React.ReactNode }) {
  const progress = useSharedValue(0);
  // Reanimated reads the OS switch. A sweeping light is decorative motion — the
  // shape still communicates "loading" without it.
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false
    );
  }, [progress, reduced]);

  return (
    <SkeletonClock.Provider value={reduced ? null : progress}>
      {children}
    </SkeletonClock.Provider>
  );
}

export function SkeletonBone({
  w,
  h = 12,
  radius,
  circle = false,
  size,
  onDark = false,
  style,
}: {
  // A number of points, or a percentage of the parent — `"60%"` for a bone that
  // is "most of the row".
  w?: DimensionValue;
  h?: number;
  radius?: number;
  // An avatar-shaped bone. `size` sets both axes and the radius follows.
  circle?: boolean;
  size?: number;
  /**
   * On a surface that is dark in both themes — the `onPhoto` sheet. Not "the
   * dark theme": the light palette's bone is dark ink, which would be invisible
   * there. Picks the `*OnDark` pair instead.
   */
  onDark?: boolean;
  style?: React.ComponentProps<typeof View>['style'];
}) {
  const clock = useContext(SkeletonClock);
  // The bone's own width in points, which the sheen needs to know how far to
  // travel. Measured rather than assumed because `w` is often a percentage.
  const [width, setWidth] = useState(0);
  // react-native-svg resolves gradient ids globally, so two bones sharing one id
  // can fill from each other's gradient — a documented Android failure.
  const gradientId = useId();

  const boxWidth: DimensionValue | undefined = circle ? size : w;
  const boxHeight = circle ? size : h;
  const boxRadius = circle ? (size ?? 0) / 2 : (radius ?? (h ? h / 2 : 6));

  const band = Math.max(MIN_BAND, width * BAND_SCALE);
  const sheen = onDark ? COLORS.skeletonSheenOnDark : COLORS.skeletonSheen;

  const sheenStyle = useAnimatedStyle(() => {
    if (!clock || width === 0) return { opacity: 0 };
    return {
      opacity: 1,
      // From fully off the leading edge to fully off the trailing one, so the
      // bone spends part of each cycle with no light on it at all.
      transform: [{ translateX: -band + clock.value * (width + band) }],
    };
  });

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        styles.bone,
        onDark && styles.boneOnDark,
        { width: boxWidth, height: boxHeight, borderRadius: boxRadius },
        style,
      ]}
    >
      {/* Clipped to the bone's radius by the parent's `overflow: hidden`, which
          is what makes the light follow a circle's edge on an avatar bone. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { width: band }, sheenStyle]}
        pointerEvents="none"
      >
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={sheen} stopOpacity={0} />
              <Stop offset="0.5" stopColor={sheen} stopOpacity={1} />
              <Stop offset="1" stopColor={sheen} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = themedStyles(() => ({
  bone: {
    backgroundColor: COLORS.skeletonBone,
    overflow: 'hidden',
  },
  boneOnDark: { backgroundColor: COLORS.skeletonBoneOnDark },
}));
