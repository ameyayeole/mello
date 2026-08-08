import { ReactNode, useCallback } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { COLORS } from '@/constants/colors';
import { RADIUS } from '@/constants/spacing';
import { haptic } from '@/components/ui/dealtCardGeometry';
import { themedStyles } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Hold to commit. Used by the rewind step, where the claim is PUBLIC —
// encore_requests_select is USING (is_event_attendee(...)) (032_wrap.sql:464) —
// so the effort is proportionate to something other people will read. A hold
// cannot happen by accident.
//
// Driven from Pressable's onPressIn/onPressOut rather than Gesture.LongPress:
// a long-press gesture fires once at its threshold with no progress to render,
// and pairing Tap with Pan to fake one fights the deck's own gestures.
export function HoldToConfirm({
  size = 132,
  durationMs = 1200,
  onComplete,
  children,
}: {
  size?: number;
  durationMs?: number;
  onComplete: () => void;
  children: ReactNode;
}) {
  const progress = useSharedValue(0);

  const R = size / 2 - 4;
  const CIRCUMFERENCE = 2 * Math.PI * R;

  const finish = useCallback(() => {
    haptic('save');
    onComplete();
  }, [onComplete]);

  const begin = () => {
    haptic('threshold');
    progress.value = withTiming(1, { duration: durationMs }, (done) => {
      if (done) runOnJS(finish)();
    });
  };

  const cancel = () => {
    // Drains rather than snapping: releasing early should feel like letting go
    // of something, not like a reset.
    progress.value = withTiming(0, { duration: 220 });
  };

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  const floodStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.9,
  }));

  return (
    <Pressable
      onPressIn={begin}
      onPressOut={cancel}
      accessibilityRole="button"
      accessibilityHint="Press and hold to confirm"
      style={[styles.wrap, { width: size, height: size }]}
    >
      <View style={[styles.flood, { borderRadius: size / 2 }]}>
        {/* Lottie L2 goes here — scrubbed by `progress`, not autoplayed. See
            docs/superpowers/specs/2026-08-07-wrap-lottie-manifest.md. Until the
            asset exists this is a colour flood, which is honest but flat. */}
        <Animated.View
          style={[
            styles.floodFill,
            { borderRadius: size / 2 },
            floodStyle,
          ]}
        />
      </View>

      <Svg width={size} height={size} style={styles.ring}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          stroke={COLORS.border}
          strokeWidth={4}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={R}
          stroke={COLORS.primary}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          animatedProps={ringProps}
          // Starts at 12 o'clock rather than 3.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <View style={styles.content}>{children}</View>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  flood: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    overflow: 'hidden',
    backgroundColor: COLORS.primaryTint,
  },
  floodFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.primary,
  },
  ring: { position: 'absolute' },
  content: { alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.full },
}));
