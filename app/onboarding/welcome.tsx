import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, MelloPin } from '@/components/ui';

// Decorative map illustration: grid, roads, park, pins, cluster — per design.
function MapHero() {
  const pulse = useSharedValue(0);
  pulse.value = withRepeat(
    withSequence(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) })
    ),
    -1
  );
  const clusterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.08 }],
  }));

  const drop1 = useSharedValue(-40);
  const drop2 = useSharedValue(-40);
  drop1.value = withDelay(200, withSpring(0, { damping: 12 }));
  drop2.value = withDelay(420, withSpring(0, { damping: 12 }));
  const pin1Style = useAnimatedStyle(() => ({
    transform: [{ translateY: drop1.value }],
    opacity: drop1.value < -30 ? 0 : 1,
  }));
  const pin2Style = useAnimatedStyle(() => ({
    transform: [{ translateY: drop2.value }],
    opacity: drop2.value < -30 ? 0 : 1,
  }));

  return (
    <View style={styles.mapWrap}>
      {/* grid */}
      {Array.from({ length: 10 }).map((_, i) => (
        <View key={`v${i}`} style={[styles.gridLineV, { left: `${(i + 1) * 10}%` }]} />
      ))}
      {Array.from({ length: 12 }).map((_, i) => (
        <View key={`h${i}`} style={[styles.gridLineH, { top: `${(i + 1) * 8}%` }]} />
      ))}
      {/* roads */}
      <View style={[styles.road, { top: '22%', height: 16, transform: [{ rotate: '-16deg' }] }]} />
      <View style={[styles.road, { top: '56%', height: 12, transform: [{ rotate: '10deg' }] }]} />
      {/* park */}
      <View style={styles.park} />
      {/* pins */}
      <Animated.View style={[styles.pinA, pin1Style]}>
        <MelloPin height={48} />
      </Animated.View>
      <Animated.View style={[styles.pinB, pin2Style]}>
        <MelloPin height={38} />
      </Animated.View>
      {/* cluster */}
      <Animated.View style={[styles.cluster, clusterStyle]}>
        <Text style={styles.clusterText}>9</Text>
      </Animated.View>
      {/* fade to white */}
      <Svg style={styles.fade} pointerEvents="none">
        <Defs>
          <LinearGradient id="mapFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity={0} />
            <Stop offset="1" stopColor="#fff" stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#mapFade)" />
      </Svg>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <MapHero />
      <View style={styles.content}>
        <Animated.View entering={FadeInDown.delay(150).duration(500)}>
          <Text style={styles.headline}>Real plans,{'\n'}real people, nearby</Text>
          <Text style={styles.sub}>
            See what's happening around you and join in — coffee, climbs, gigs,
            game nights.
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(300).duration(500)}
          style={styles.actions}
        >
          <View style={styles.dots}>
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
          <Button
            label="Get started"
            onPress={() => router.push('/onboarding/permissions')}
          />
          <TouchableOpacity
            onPress={() => router.push('/auth/login')}
            hitSlop={10}
          >
            <Text style={styles.loginLink}>
              Already have an account?{' '}
              <Text style={styles.loginLinkBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  mapWrap: {
    flex: 1,
    backgroundColor: '#E9ECEF',
    overflow: 'hidden',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(15,24,44,0.05)',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(15,24,44,0.05)',
  },
  road: {
    position: 'absolute',
    left: '-10%',
    width: '130%',
    backgroundColor: '#fff',
  },
  park: {
    position: 'absolute',
    top: '34%',
    left: '12%',
    width: 110,
    height: 110,
    borderRadius: 22,
    backgroundColor: 'rgba(31,164,99,0.10)',
  },
  pinA: { position: 'absolute', top: '28%', left: '26%' },
  pinB: { position: 'absolute', top: '46%', left: '60%' },
  cluster: {
    position: 'absolute',
    top: '60%',
    left: '40%',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  clusterText: { fontFamily: FONTS.heavy, fontSize: 14, color: '#fff' },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -1,
    height: 150,
  },
  content: {
    paddingHorizontal: 26,
    paddingBottom: 18,
    paddingTop: 8,
    backgroundColor: COLORS.surface,
  },
  headline: {
    fontFamily: FONTS.heavy,
    fontSize: 29,
    lineHeight: 33,
    letterSpacing: -0.58,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  sub: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
  actions: { marginTop: 20, gap: 14 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(15,24,44,0.15)',
  },
  dotActive: { width: 20, backgroundColor: COLORS.primary },
  loginLink: {
    textAlign: 'center',
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  loginLinkBold: { color: COLORS.primary, fontFamily: FONTS.bold },
});
