import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { COLORS } from '@/constants/colors';

// The app's backdrop: a soft vertical gradient with two slowly drifting colour
// blobs behind it. Every frosted surface in the app is translucent, so this is
// what they are translucent *over* — without it, glass has nothing to reveal
// and reads as flat white boxes. See DESIGN.md §2.
//
// Mount it once, behind the tab navigator, not per screen: it is a single
// living surface that the screens slide over, and one instance means the blobs
// don't jump back to their start position on every tab change.
//
// The blobs are radial gradients, not blurred circles. A circle plus a blur
// pass would be a full-screen backdrop filter on every frame — expensive, and
// on Android not really available. A radial gradient with an alpha falloff *is*
// the same image, drawn once by the GPU and then only translated and scaled.

// Nothing here is on the spacing scale on purpose: this is the geometry of a
// blurred shape, and rounding it to 4px steps would change the composition for
// no benefit.
//
// One blob, not two. The mockup carries a second coral one at the lower left,
// but at the size the phone actually renders it, it read as a pink wash across
// the bottom third of every screen rather than as a hint of colour — strong
// enough to tint the plan rows sitting on top of it. The periwinkle alone does
// the job the background is there to do.
const BLOB_COOL = { size: 440, top: -170, right: -130 };

// Slow enough that you never catch it moving — you only notice if it stops.
const DRIFT_COOL_MS = 20000;

// A blob's whole cycle is one shared 0→1 progress value, so translate and scale
// stay in lockstep and the loop closes seamlessly.
function useDrift(durationMs: number) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.quad) }),
      -1,
      true // reverse, so the blob returns along its own path rather than snapping
    );
  }, [progress, durationMs]);
  return progress;
}

function Blob({
  color,
  size,
  style,
  progress,
  dx,
  dy,
  scaleFrom,
  scaleTo,
  gradientId,
}: {
  color: string;
  size: number;
  style: { top?: number; bottom?: number; left?: number; right?: number };
  progress: SharedValue<number>;
  dx: number;
  dy: number;
  scaleFrom: number;
  scaleTo: number;
  gradientId: string;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * dx },
      { translateY: progress.value * dy },
      { scale: scaleFrom + progress.value * (scaleTo - scaleFrom) },
    ],
  }));

  return (
    <Animated.View
      style={[{ position: 'absolute', width: size, height: size }, style, animatedStyle]}
      pointerEvents="none"
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={gradientId} cx="50%" cy="50%" r="50%">
            {/* Three stops, not two: a straight linear falloff to transparent
                leaves a visible hard-ish edge where alpha hits zero. Easing the
                middle stop down is what makes it read as blurred.

                The peak is deliberately low. A radial gradient concentrates its
                colour at the centre in a way a Gaussian blur does not, so
                matching the mockup's flat 0.28 alpha here produced something
                far heavier than the mockup looks. */}
            <Stop offset="0%" stopColor={color} stopOpacity={0.26} />
            <Stop offset="55%" stopColor={color} stopOpacity={0.1} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${gradientId})`} />
      </Svg>
    </Animated.View>
  );
}

export function AppBackground() {
  const { width, height } = useWindowDimensions();
  const coolProgress = useDrift(DRIFT_COOL_MS);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="appBgBase" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={COLORS.bgGradientTop} />
            <Stop offset="55%" stopColor={COLORS.bgGradientMid} />
            <Stop offset="100%" stopColor={COLORS.bgGradientBottom} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#appBgBase)" />
      </Svg>

      <Blob
        gradientId="appBgBlobCool"
        color={COLORS.bgBlobCool}
        size={BLOB_COOL.size}
        style={{ top: BLOB_COOL.top, right: BLOB_COOL.right }}
        progress={coolProgress}
        dx={40}
        dy={-46}
        scaleFrom={1}
        scaleTo={1.18}
      />
    </View>
  );
}
