import { useEffect, useRef} from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
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
import { DealtOrigin, useUIStore } from '@/stores/uiStore';
import { ExploreEvent } from '@/types/models';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { eventImageUri } from '@/utils/events';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { PressableScale, useTabBarInset } from '@/components/ui';

// How far the card stack's lower edge slides under the floating tab bar. The
// stack reads as tucked into the nav rather than parked above it.
const TUCK = 26;

// Front card sits upright-ish; the two behind fan away to the left, like a
// hand of cards peeking out of a pocket.
// The fan's own angles. Exported because the dealt deck starts its cards at
// exactly these, so the cards that lift off are visibly the ones that were
// lying here.
export const TEASER_TILTS = [5, -7, -19];

const TILTS = [
  { rotate: '5deg', x: 12, y: 0 }, // front
  { rotate: '-7deg', x: 0, y: 3 },
  { rotate: '-19deg', x: -12, y: 8 },
];

function MiniCard({
  cardRef,
  event,
  index,
  emoji: emojiOverride,
}: {
  cardRef?: (node: View | null) => void;
  event?: ExploreEvent;
  index: number;
  emoji?: string;
}) {
  const cat = event ? categoryStyle(event.activity) : null;
  const emoji =
    emojiOverride ??
    (event ? (ACTIVITY_MAP[event.activity]?.emoji ?? '📍') : '📍');
  const t = TILTS[index];
  const imageUri = event ? eventImageUri(event) : null;
  return (
    <View
      // Measured individually: the deck's cards lift off from their own mini,
      // not from the fan's overall box. `collapsable={false}` because view
      // flattening removes an unstyled wrapper on Android and a flattened node
      // cannot be measured.
      ref={cardRef}
      collapsable={false}
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
      {imageUri ? (
        <>
          <Image
            source={{ uri: imageUri }}
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
  // The fan is not a button that opens a deck — it IS the deck. So while the
  // deck is dealt out on screen, the fan must not still be sitting here: the
  // same three cards cannot be in two places, and leaving them behind is what
  // made the deal read as a jump between two separate things rather than one
  // set of cards moving up.
  //
  // Hidden instantly rather than faded. A fade would have the fan visibly
  // dissolve while its own cards are still travelling out of it, which reads
  // as a third thing happening; the cards leaving IS the transition.
  const dealtSource = useUIStore((st) => st.dealtCard?.source);
  const lifted = dealtSource === 'swipeDeck';
  const fanRef = useRef<View>(null);
  // One per visible mini, keyed by its place in the fan — index 0 is the front
  // card, which is also the deck's top card.
  const miniRefs = useRef<(View | null)[]>([]);
  const { deck, isLoading } = useSwipeDeck();
  const tabBarInset = useTabBarInset();

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
  // See `lifted` above: gone, not faded, for exactly as long as its cards are
  // out on the table.
  const liftedStyle = useAnimatedStyle(() => ({ opacity: lifted ? 0 : 1 }));

  if (isLoading) return null;
  const preview = deck.slice(0, 3);
  const caughtUp = preview.length === 0;

  return (
    <Animated.View
      entering={FadeInUp.delay(350).duration(450)}
      style={[styles.wrap, { bottom: tabBarInset - TUCK }, swayStyle, liftedStyle]}
      pointerEvents={lifted ? 'none' : 'box-none'}
    >
      {/* Plain View around the stack so its rect can be measured: the deck
          screen deals its cards out of exactly this fan and settles them back
          into it on the way out. `collapsable={false}` because view flattening
          removes an unstyled wrapper on Android, and the ref cannot go on the
          `PressableScale` — same constraint `useOpenOverlay` documents. */}
      <PressableScale
        scaleTo={0.9}
        onPress={() => {
          // Exactly what a map pin does — `dealCard` with a measured rect as
          // the origin — except the deck is the swipe queue, the source is
          // 'swipeDeck' (which turns on the messy stack and routes a swipe
          // through the day's quota), and every mini is measured, not just the
          // fan. Card N lifts off from mini N, so what rises really is the
          // card that was lying there.
          const ids = deck.map((e) => e.id);
          const fan = fanRef.current;
          const minis = miniRefs.current.filter(Boolean) as View[];

          const open = (
            origin: DealtOrigin | null,
            origins?: DealtOrigin[]
          ) =>
            useUIStore
              .getState()
              .dealCard(ids, 0, origin, 'swipeDeck', origins);

          if (!fan) {
            open(null);
            return;
          }

          // measureInWindow is callback-based with no promise form, so the
          // minis are gathered by counting completions rather than awaited.
          const rects: DealtOrigin[] = [];
          let pending = minis.length;
          const finish = (fanRect: DealtOrigin) =>
            open(fanRect, rects.length === minis.length ? rects : undefined);

          fan.measureInWindow((fx, fy, fw, fh) => {
            const fanRect = { x: fx, y: fy, width: fw, height: fh };
            if (pending === 0) {
              finish(fanRect);
              return;
            }
            minis.forEach((node, i) => {
              node.measureInWindow((x, y, width, height) => {
                rects[i] = { x, y, width, height };
                pending -= 1;
                if (pending === 0) finish(fanRect);
              });
            });
          });
        }}
        accessibilityRole="button"
        accessibilityLabel={
          caughtUp
            ? 'Open the event deck — all caught up for now'
            : `Swipe through ${deck.length} events near you`
        }
        style={styles.stack}
      >
        <View ref={fanRef} style={StyleSheet.absoluteFill} collapsable={false} pointerEvents="none" />
        {caughtUp
          ? CAUGHT_UP_EMOJI.map((emoji, i) => (
              <MiniCard key={emoji} emoji={emoji} index={i} />
            ))
          : preview.map((event, i) => (
              <MiniCard
                key={event.id}
                event={event}
                index={i}
                cardRef={(node) => {
                  miniRefs.current[i] = node;
                }}
              />
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
    // `bottom` is set inline — see TUCK.
  },
  stack: {
    width: 116,
    height: 138,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: SPACING[1],
  },
  mini: {
    position: 'absolute',
    bottom: 0,
    width: 82,
    height: 110,
    borderRadius: RADIUS.md,
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
  miniEmoji: { fontSize: TYPE_SIZE.display },
  miniEmojiBadge: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    width: 24,
    height: 24,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBadgeEmoji: { fontSize: TYPE_SIZE.caption },
  countBadge: {
    position: 'absolute',
    top: 12,
    right: 8,
    zIndex: 4,
    minWidth: 24,
    height: 24,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING[1.5],
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontFamily: FONTS.heavy, fontSize: TYPE_SIZE.micro, color: '#fff' },
  labelPill: {
    position: 'absolute',
    top: 4,
    left: 0,
    zIndex: 4,
    height: 26,
    paddingHorizontal: SPACING[2.5],
    borderRadius: RADIUS.full,
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
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textPrimary,
  },
});
