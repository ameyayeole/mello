import { useRef, useState, ComponentType } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import {
  View,
  Text,
  StyleSheet,
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
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Button, Screen } from '@/components/ui';
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
    <Screen background={COLORS.surface}>
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
        <Button
  variant="primary" label={isLast ? 'Get started' : 'Next'} onPress={handleNext} />
        <TouchableOpacity onPress={() => router.push('/auth/login')} hitSlop={10}>
          <Text style={styles.loginLink}>
            Already have an account?{' '}
            <Text style={styles.loginLinkBold}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skip: {
    position: 'absolute',
    top: 62,
    right: 22,
    zIndex: 10,
    paddingVertical: SPACING[1],
    paddingHorizontal: SPACING[1],
  },
  skipText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textMuted,
  },
  scroller: { flex: 1 },
  sceneWrap: { flex: 1 },
  textBlock: {
    paddingHorizontal: SPACING[7],
    paddingTop: SPACING[1],
    paddingBottom: SPACING[2.5],
    minHeight: 118,
  },
  headline: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.h1,
    lineHeight: 32,
    letterSpacing: -0.7,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  sub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[2.5],
  },
  actions: {
    paddingHorizontal: SPACING[6],
    paddingBottom: SPACING[4],
    gap: SPACING[3.5],
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING[1.5],
  },
  dot: { height: 6, borderRadius: RADIUS.xs },
  loginLink: {
    textAlign: 'center',
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textSecondary,
  },
  loginLinkBold: { color: COLORS.primary, fontFamily: FONTS.bold },
});
