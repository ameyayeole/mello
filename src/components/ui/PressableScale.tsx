import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Damping 20 against stiffness 400 is a damping ratio of 0.5 — well
// underdamped, so the release overshot past scale 1 and every control in the
// app swelled slightly before settling. That is what read as bounce, and it was
// worst wherever scaleTo was deep. 0.85 keeps the spring's give without the
// visible rebound: it settles crisply instead of wobbling back.
const PRESS_SPRING = { damping: 34, stiffness: 400, mass: 1 } as const;

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
