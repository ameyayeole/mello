import { useRef, useState, ComponentType } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  interpolateColor,
  Extrapolation,
  SharedValue,
} from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button } from '@/components/ui';
import { DiscoverScene } from '@/components/onboarding/scenes/DiscoverScene';
import { CreateScene } from '@/components/onboarding/scenes/CreateScene';
import { SwipeScene } from '@/components/onboarding/scenes/SwipeScene';
import { SafetyScene } from '@/components/onboarding/scenes/SafetyScene';

const SLIDES: {
  key: string;
  headline: string;
  sub: string;
  Scene: ComponentType;
}[] = [
  {
    key: 'discover',
    headline: 'See what’s happening\naround you',
    sub: 'Live plans from real people nearby: coffee, gigs, treks, game nights.',
    Scene: DiscoverScene,
  },
  {
    key: 'create',
    headline: 'Drop a pin,\nmake a plan',
    sub: 'Pick a spot on the map, set a time, and your event is live in seconds.',
    Scene: CreateScene,
  },
  {
    key: 'swipe',
    headline: 'Swipe events, save\nthe ones you like',
    sub: 'Flick through what’s on around you and build your wishlist.',
    Scene: SwipeScene,
  },
  {
    key: 'safety',
    headline: 'Real people,\nverified and safe',
    sub: 'ID-verified hosts, women-only events, and safety tools in every plan.',
    Scene: SafetyScene,
  },
];

function Dot({ index, scrollX, width }: { index: number; scrollX: SharedValue<number>; width: number }) {
  const dotStyle = useAnimatedStyle(() => {
    const page = scrollX.value / width;
    return {
      width: interpolate(page, [index - 1, index, index + 1], [6, 20, 6], Extrapolation.CLAMP),
      backgroundColor: interpolateColor(
        page,
        [index - 1, index, index + 1],
        ['rgba(0,0,0,0.12)', COLORS.primary, 'rgba(0,0,0,0.12)']
      ),
    };
  });
  return <Animated.View style={[styles.dot, dotStyle]} />;
}

export default function WelcomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
  });

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  const isLast = index === SLIDES.length - 1;

  function handleNext() {
    if (isLast) {
      router.push('/onboarding/permissions');
    } else {
      scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {!isLast && (
        <TouchableOpacity
          style={styles.skip}
          hitSlop={12}
          onPress={() => router.push('/onboarding/permissions')}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
        style={styles.scroller}
      >
        {SLIDES.map(({ key, headline, sub, Scene }) => (
          <View key={key} style={{ width }}>
            <View style={styles.sceneWrap}>
              <Scene />
            </View>
            <View style={styles.textBlock}>
              <Text style={styles.headline}>{headline}</Text>
              <Text style={styles.sub}>{sub}</Text>
            </View>
          </View>
        ))}
      </Animated.ScrollView>

      <Animated.View entering={FadeInDown.delay(250).duration(500)} style={styles.actions}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <Dot key={s.key} index={i} scrollX={scrollX} width={width} />
          ))}
        </View>
        <Button label={isLast ? 'Get started' : 'Next'} onPress={handleNext} />
        <TouchableOpacity onPress={() => router.push('/auth/login')} hitSlop={10}>
          <Text style={styles.loginLink}>
            Already have an account?{' '}
            <Text style={styles.loginLinkBold}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  skip: {
    position: 'absolute',
    top: 62,
    right: 22,
    zIndex: 10,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  skipText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  scroller: { flex: 1 },
  sceneWrap: { flex: 1 },
  textBlock: {
    paddingHorizontal: 30,
    paddingTop: 4,
    paddingBottom: 10,
    minHeight: 118,
  },
  headline: {
    fontFamily: FONTS.heading,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.7,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  sub: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
  actions: {
    paddingHorizontal: 26,
    paddingBottom: 18,
    gap: 14,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { height: 6, borderRadius: 10 },
  loginLink: {
    textAlign: 'center',
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  loginLinkBold: { color: COLORS.primary, fontFamily: FONTS.bold },
});
