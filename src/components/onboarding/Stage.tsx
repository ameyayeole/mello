import { ReactNode, useEffect } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import Svg, {
  Defs,
  RadialGradient,
  LinearGradient,
  Stop,
  Rect,
  Circle,
  Path,
} from 'react-native-svg';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';

// Shared illustration stage for the intro tour: soft radial backdrop with
// drifting glow blobs, faded into the content surface at the bottom.
export function Stage({ children }: { children: ReactNode }) {
  return (
    <View style={styles.stage}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="stageTint" cx="50%" cy="32%" r="75%">
            <Stop offset="0" stopColor={COLORS.primary} stopOpacity={0.07} />
            <Stop offset="1" stopColor={COLORS.primary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#stageTint)" />
      </Svg>
      <Glow size={230} color={COLORS.primary} style={{ top: -60, left: -70 }} />
      <Glow
        size={200}
        color={COLORS.accent}
        opacity={0.07}
        duration={9000}
        style={{ bottom: 30, right: -60 }}
      />
      <View style={styles.stageContent}>{children}</View>
      <Svg style={styles.fade} pointerEvents="none">
        <Defs>
          <LinearGradient id="stageFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={COLORS.surface} stopOpacity={0} />
            <Stop offset="1" stopColor={COLORS.surface} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#stageFade)" />
      </Svg>
    </View>
  );
}

// Soft radial blob that drifts slowly to keep the backdrop alive.
export function Glow({
  size = 220,
  color = COLORS.primary,
  opacity = 0.12,
  duration = 7000,
  style,
}: {
  size?: number;
  color?: string;
  opacity?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [drift, duration]);
  const driftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drift.value * 14 }, { translateX: drift.value * 8 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size }, style, driftStyle]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="glowBlob" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill="url(#glowBlob)" />
      </Svg>
    </Animated.View>
  );
}

// White card that enters softly, then floats. The building block every scene
// uses for mock UI (event cards, chips, wizard sheets).
export function FloatingCard({
  children,
  style,
  delay = 0,
  float = 5,
  duration = 3600,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  float?: number;
  duration?: number;
}) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(
      delay + 600,
      withRepeat(
        withSequence(
          withTiming(-float, { duration, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration, easing: Easing.inOut(Easing.quad) })
        ),
        -1
      )
    );
  }, [y, delay, float, duration]);
  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(450).easing(Easing.out(Easing.cubic))}
      style={[styles.card, style, floatStyle]}
    >
      {children}
    </Animated.View>
  );
}

// The app's actual map pin: a white circle with the activity emoji and the
// host's avatar tucked in the corner. Pops in exactly like pins do on the
// live map (same spring as PopPin in the map screen).
export function EventPin({
  emoji,
  size = 52,
  avatarColor,
  delay = 0,
  pulse,
}: {
  emoji: string;
  size?: number;
  avatarColor?: string;
  delay?: number;
  pulse?: string;
}) {
  const scale = useSharedValue(0);
  useEffect(() => {
    scale.value = withDelay(
      delay,
      withSpring(1, { damping: 16, stiffness: 180, mass: 0.9 })
    );
  }, [scale, delay]);
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const avatarSize = size * 0.42;
  return (
    <Animated.View style={[styles.eventPinWrap, popStyle]}>
      {pulse && (
        <View style={styles.pinRingSeat}>
          <PulseRing size={size * 1.5} color={pulse} delay={delay + 700} />
        </View>
      )}
      <View
        style={[
          styles.pinBubble,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <Text style={{ fontSize: size * 0.52, lineHeight: size * 0.66 }}>
          {emoji}
        </Text>
      </View>
      {avatarColor && (
        <View
          style={[
            styles.pinAvatar,
            {
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
              backgroundColor: avatarColor,
            },
          ]}
        />
      )}
    </Animated.View>
  );
}

// The map's coral cluster bubble ("3 plans here").
export function ClusterBubble({
  count,
  size = 44,
  delay = 0,
}: {
  count: number;
  size?: number;
  delay?: number;
}) {
  const scale = useSharedValue(0);
  useEffect(() => {
    scale.value = withDelay(
      delay,
      withSpring(1, { damping: 16, stiffness: 180, mass: 0.9 })
    );
  }, [scale, delay]);
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.clusterBubble,
        { width: size, height: size, borderRadius: size / 2 },
        popStyle,
      ]}
    >
      <Text style={styles.clusterCount}>{count}</Text>
    </Animated.View>
  );
}

// Expanding ring that pulses under a dropped pin.
export function PulseRing({
  size = 40,
  color = COLORS.primary,
  delay = 0,
}: {
  size?: number;
  color?: string;
  delay?: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 0 })
        ),
        -1
      )
    );
  }, [t, delay]);
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.4 + t.value * 0.9 }],
    opacity: 0.5 * (1 - t.value),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: color,
        },
        ringStyle,
      ]}
    />
  );
}

// Stylised street map on a rounded panel: curved roads, a park, a pond.
// The shared "living map" every scene builds on. With `panning`, the streets
// drift slowly under whatever sits on top, like the map moving under a
// fixed pin.
export function MapPanel({
  style,
  tilt = '0deg',
  panning = false,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  tilt?: string;
  panning?: boolean;
  children?: ReactNode;
}) {
  const pan = useSharedValue(0);
  useEffect(() => {
    if (!panning) return;
    pan.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [pan, panning]);
  const panStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1.08 },
      { translateX: interpolate(pan.value, [0, 1], [8, -8]) },
      { translateY: interpolate(pan.value, [0, 1], [-4, 4]) },
    ],
  }));

  return (
    <Animated.View
      entering={FadeInUp.duration(500).easing(Easing.out(Easing.cubic))}
      style={[styles.mapPanel, { transform: [{ rotate: tilt }] }, style]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, panStyle]}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 300 340"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* park + pond */}
        <Rect x={26} y={196} width={104} height={92} rx={20} fill="rgba(31,164,99,0.12)" />
        <Circle cx={236} cy={84} r={34} fill="rgba(42,111,219,0.10)" />
        {/* roads */}
        <Path
          d="M-10 90 C 70 70, 120 130, 200 110 S 320 60, 340 80"
          stroke="rgba(15,24,44,0.07)"
          strokeWidth={16}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M60 -10 C 80 80, 40 160, 90 240 S 120 320, 110 360"
          stroke="rgba(15,24,44,0.06)"
          strokeWidth={12}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M-10 250 C 90 230, 180 290, 320 240"
          stroke="rgba(15,24,44,0.07)"
          strokeWidth={14}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M200 -10 C 210 90, 250 150, 230 250 S 220 330, 230 360"
          stroke="rgba(15,24,44,0.05)"
          strokeWidth={8}
          strokeLinecap="round"
          fill="none"
        />
        {/* blocks */}
        <Rect x={160} y={160} width={34} height={24} rx={7} fill="rgba(15,24,44,0.05)" />
        <Rect x={122} y={52} width={26} height={26} rx={7} fill="rgba(15,24,44,0.05)" />
        <Rect x={58} y={120} width={30} height={22} rx={7} fill="rgba(15,24,44,0.045)" />
        <Rect x={168} y={288} width={40} height={22} rx={7} fill="rgba(15,24,44,0.045)" />
      </Svg>
      </Animated.View>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: 'hidden' },
  stageContent: { flex: 1 },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -1,
    height: 90,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    shadowColor: '#0F182C',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  eventPinWrap: { alignItems: 'center', justifyContent: 'center' },
  pinRingSeat: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBubble: {
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F182C',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  pinAvatar: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderWidth: 2,
    borderColor: '#fff',
  },
  clusterBubble: {
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F182C',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  clusterCount: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: '#fff',
  },
  mapPanel: {
    backgroundColor: '#FDFDFD',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.06)',
    overflow: 'hidden',
    shadowColor: '#0F182C',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
});
