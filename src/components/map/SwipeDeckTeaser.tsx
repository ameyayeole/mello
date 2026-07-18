import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSwipeDeck } from '@/hooks/useSwipeDeck';
import { ExploreEvent } from '@/types/models';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { PressableScale } from '@/components/ui';

// Front card sits upright-ish; the two behind fan away to the left, like a
// hand of cards peeking out of a pocket.
const TILTS = [
  { rotate: '5deg', x: 12, y: 0 }, // front
  { rotate: '-7deg', x: 0, y: 3 },
  { rotate: '-19deg', x: -12, y: 8 },
];

function MiniCard({
  event,
  index,
  emoji: emojiOverride,
}: {
  event?: ExploreEvent;
  index: number;
  emoji?: string;
}) {
  const cat = event ? categoryStyle(event.activity) : null;
  const emoji =
    emojiOverride ??
    (event ? (ACTIVITY_MAP[event.activity]?.emoji ?? '📍') : '📍');
  const t = TILTS[index];
  return (
    <View
      style={[
        styles.mini,
        { backgroundColor: cat?.tint ?? COLORS.primaryTint, zIndex: 3 - index },
        {
          transform: [
            { translateX: t.x },
            { translateY: t.y },
            { rotate: t.rotate },
          ],
        },
      ]}
    >
      {event?.image_url ? (
        <>
          <Image
            source={{ uri: event.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
          />
          <View style={styles.miniEmojiBadge}>
            <Text style={styles.miniBadgeEmoji}>{emoji}</Text>
          </View>
        </>
      ) : (
        <Text style={styles.miniEmoji}>{emoji}</Text>
      )}
    </View>
  );
}

// What the stack shows once everything's been swiped — friendly placeholders
// instead of disappearing, so the entry point is always there.
const CAUGHT_UP_EMOJI = ['✨', '🎉', '👀'];

// A little fan of the top deck cards, peeking out from the bottom-left of the
// map (its lower edge tucks behind the tab bar). Sways gently to invite a tap;
// tapping opens the swipe deck. When the deck's been swiped through it stays
// put, showing placeholder cards and an "All caught up" label instead of
// vanishing.
export default function SwipeDeckTeaser() {
  const router = useRouter();
  const { deck, isLoading } = useSwipeDeck();

  const sway = useSharedValue(0);
  useEffect(() => {
    sway.value = withDelay(
      1500,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      )
    );
  }, []);
  const swayStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sway.value * 3 - 1.5}deg` }],
  }));

  if (isLoading) return null;
  const preview = deck.slice(0, 3);
  const caughtUp = preview.length === 0;

  return (
    <Animated.View
      entering={FadeInUp.delay(350).duration(450)}
      style={[styles.wrap, swayStyle]}
      pointerEvents="box-none"
    >
      <PressableScale
        scaleTo={0.9}
        onPress={() => router.push('/events/swipe')}
        accessibilityRole="button"
        accessibilityLabel={
          caughtUp
            ? 'Open the event deck — all caught up for now'
            : `Swipe through ${deck.length} events near you`
        }
        style={styles.stack}
      >
        {caughtUp
          ? CAUGHT_UP_EMOJI.map((emoji, i) => (
              <MiniCard key={emoji} emoji={emoji} index={i} />
            ))
          : preview.map((event, i) => (
              <MiniCard key={event.id} event={event} index={i} />
            ))}
        {!caughtUp && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {deck.length > 9 ? '9+' : deck.length}
            </Text>
          </View>
        )}
        <View style={styles.labelPill}>
          <Text style={styles.labelText}>
            {caughtUp ? 'All caught up' : 'Up for it?'}
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 4,
    // Negative so the cards' lower edge slides out of the map view and ends up
    // hidden behind the tab bar — a stack tucked into the nav.
    bottom: -26,
  },
  stack: {
    width: 116,
    height: 138,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  mini: {
    position: 'absolute',
    bottom: 0,
    width: 82,
    height: 110,
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: '#fff',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F182C',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  miniEmoji: { fontSize: 36 },
  miniEmojiBadge: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBadgeEmoji: { fontSize: 12 },
  countBadge: {
    position: 'absolute',
    top: 12,
    right: 8,
    zIndex: 4,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontFamily: FONTS.heavy, fontSize: 11.5, color: '#fff' },
  labelPill: {
    position: 'absolute',
    top: 4,
    left: 0,
    zIndex: 4,
    height: 26,
    paddingHorizontal: 11,
    borderRadius: 100,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
    shadowColor: '#0F182C',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  labelText: {
    fontFamily: FONTS.heavy,
    fontSize: 12,
    color: COLORS.textPrimary,
  },
});
