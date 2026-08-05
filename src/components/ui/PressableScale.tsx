import { useMemo } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useCardTap } from './cardTapContext';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Damping 20 against stiffness 400 is a damping ratio of 0.5 — well
// underdamped, so the release overshot past scale 1 and every control in the
// app swelled slightly before settling. That is what read as bounce, and it was
// worst wherever scaleTo was deep. 0.85 keeps the spring's give without the
// visible rebound: it settles crisply instead of wobbling back.
const PRESS_SPRING = { damping: 34, stiffness: 400, mass: 1 } as const;

// How far a finger may travel and still count as a press, matching the flip's
// own slop so the two agree on what a tap is.
const TAP_SLOP = 12;

// Pressable that springs down slightly on press — the app-wide tap feel.
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  ...rest
}: PressableProps & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children?: React.ReactNode;
}) {
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
  }));

  // Non-null only on a dealt card's faces. See cardTapContext for why the two
  // gesture systems cannot be left to race.
  const cardTap = useCardTap();

  const { onPress, disabled, accessibilityLabel, accessibilityRole, hitSlop } =
    rest;

  const tap = useMemo(() => {
    const g = Gesture.Tap()
      .maxDuration(400)
      .maxDistance(TAP_SLOP)
      .enabled(!disabled)
      // The press-down feel has to be driven from the gesture too — there is no
      // RN Pressable here to give us onPressIn/Out.
      .onBegin(() => {
        pressed.value = withSpring(1, PRESS_SPRING);
      })
      .onFinalize(() => {
        pressed.value = withSpring(0, PRESS_SPRING);
      })
      .onEnd(() => {
        if (onPress) runOnJS(onPress)(undefined as never);
      });
    // The card's flip waits for this to fail. A touch this control claims never
    // reaches the flip; a touch anywhere else is untouched by this.
    return cardTap ? g.blocksExternalGesture(cardTap) : g;
  }, [cardTap, disabled, onPress, pressed]);

  // Outside a card: byte-for-byte the component this has always been. The RNGH
  // path is opt-in by context precisely so the ~200 other call sites keep the
  // RN Pressable semantics they were written against.
  if (!cardTap) {
    return (
      <AnimatedPressable
        onPressIn={() => {
          pressed.value = withSpring(1, PRESS_SPRING);
        }}
        onPressOut={() => {
          pressed.value = withSpring(0, PRESS_SPRING);
        }}
        style={[style, animatedStyle]}
        {...rest}
      >
        {children}
      </AnimatedPressable>
    );
  }

  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        style={[style, animatedStyle]}
        hitSlop={hitSlop}
        accessible={!!accessibilityLabel}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessibilityState={{ disabled: !!disabled }}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
