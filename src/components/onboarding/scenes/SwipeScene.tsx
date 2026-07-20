import { useEffect } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { CATEGORY_STYLE } from '@/constants/categoryStyle';
import { Icon, IconName } from '@/components/ui';
import { Stage } from '../Stage';

const CARD_W = 210;
const CARD_H = 252;

function MockEventCard({
  icon,
  title,
  meta,
  going,
}: {
  icon: IconName;
  title: string;
  meta: string;
  going: string;
}) {
  const cat = CATEGORY_STYLE[icon as keyof typeof CATEGORY_STYLE] ?? CATEGORY_STYLE.drinks;
  return (
    <View style={styles.card}>
      <View style={[styles.cardHeader, { backgroundColor: cat.tint }]}>
        <Icon name={icon} size={44} color={cat.accent} strokeWidth={1.5} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.cardMeta}>{meta}</Text>
        <View style={styles.cardFooter}>
          <View style={styles.avatars}>
            <View style={[styles.avatar, { backgroundColor: '#F3C6A5' }]} />
            <View style={[styles.avatar, styles.avatarOverlap, { backgroundColor: '#B7C9E8' }]} />
            <View style={[styles.avatar, styles.avatarOverlap, { backgroundColor: '#E8C4D8' }]} />
          </View>
          <Text style={styles.going}>{going}</Text>
        </View>
      </View>
    </View>
  );
}

// Slide 3: a deck that flicks its top card to the right on a loop.
// p runs 0 -> 1 (fling out) then 1 -> 2 (fade back in at rest).
export function SwipeScene() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(
      withSequence(
        withDelay(
          2200,
          withTiming(1, { duration: 750, easing: Easing.inOut(Easing.cubic) })
        ),
        withTiming(2, { duration: 650, easing: Easing.out(Easing.quad) })
      ),
      -1
    );
  }, [p]);

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          p.value,
          [0, 1, 1.001, 2],
          [0, 210, 0, 0],
          Extrapolation.CLAMP
        ),
      },
      {
        rotate: `${interpolate(p.value, [0, 1, 1.001, 2], [0, 9, 0, 0], Extrapolation.CLAMP)}deg`,
      },
    ],
    opacity: interpolate(
      p.value,
      [0, 0.75, 1, 1.4, 2],
      [1, 1, 0, 0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const midStyle = useAnimatedStyle(() => {
    const rise = interpolate(p.value, [0, 1, 1.001, 2], [0, 1, 0, 0], Extrapolation.CLAMP);
    return {
      transform: [
        { scale: 0.93 + 0.05 * rise },
        { rotate: `${-4 + 4 * rise}deg` },
        { translateY: 10 - 8 * rise },
      ],
    };
  });

  const stampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [0.05, 0.3, 0.75, 1],
      [0, 1, 1, 0],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        scale: interpolate(p.value, [0.05, 0.3], [1.4, 1], Extrapolation.CLAMP),
      },
      { rotate: '-12deg' },
    ],
  }));

  return (
    <Stage>
      <View style={styles.center}>
        <View style={styles.deck}>
          <View style={[styles.layer, styles.backCard]}>
            <MockEventCard
              icon="trekking"
              title="Sunrise trek"
              meta="Sun 5:30 am · 6 km"
              going="5 going"
            />
          </View>
          <Animated.View style={[styles.layer, midStyle]}>
            <MockEventCard
              icon="music"
              title="Indie gig night"
              meta="Sat 9 pm · 1.2 km"
              going="12 going"
            />
          </Animated.View>
          <Animated.View style={[styles.layer, topStyle]}>
            <MockEventCard
              icon="parties"
              title="Rooftop party"
              meta="Fri 8 pm · 800 m"
              going="18 going"
            />
            <Animated.View style={[styles.stamp, stampStyle]}>
              <Icon name="heart" size={15} color={COLORS.success} strokeWidth={2.4} />
              <Text style={styles.stampText}>SAVED</Text>
            </Animated.View>
          </Animated.View>
        </View>
      </View>
    </Stage>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  deck: {
    width: CARD_W,
    height: CARD_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: { position: 'absolute' },
  backCard: {
    transform: [{ scale: 0.87 }, { rotate: '5deg' }, { translateY: 18 }],
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: RADIUS['3xl'],
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    shadowColor: '#0F182C',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  cardHeader: {
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, padding: SPACING[3.5] },
  cardTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.bodyLg,
    letterSpacing: -0.32,
    color: COLORS.textPrimary,
  },
  cardMeta: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  avatars: { flexDirection: 'row' },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: RADIUS.xs,
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarOverlap: { marginLeft: -7 },
  going: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textSecondary,
  },
  stamp: {
    position: 'absolute',
    top: 14,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    paddingHorizontal: SPACING[2.5],
    height: 30,
    borderRadius: RADIUS.xs,
    borderWidth: 2.5,
    borderColor: COLORS.success,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  stampText: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.bodySm,
    letterSpacing: 1,
    color: COLORS.success,
  },
});
