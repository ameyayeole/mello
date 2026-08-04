import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  FadeOut,
  ZoomIn,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSwipeDeck } from '@/hooks/useSwipeDeck';
import { DealtOrigin, useUIStore } from '@/stores/uiStore';
import { EventCard } from '@/components/events/EventCard';
import WishlistButton from '@/components/events/WishlistButton';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { PREMIUM_GOLD, PREMIUM_GOLD_TINT } from '@/utils/premium';
import {
  Button,
  Icon,
  Loader,
  PressableScale,
  ScreenHeader,
  stackLayer,
} from '@/components/ui';

// How long the deck takes to lay itself out of the map's teaser, and how much
// of that each card behind the top one waits before it starts — the stagger is
// what makes the fan unfurl rather than three cards moving as one block.
const DECK_ENTRY_MS = 620;
const DECK_STAGGER = 0.12;
// How far a card arcs off the straight line between the teaser and its resting
// place. Same trick, and roughly the same amount, as the dealt card's deal.
const DECK_ARC = 34;
// Leaving is quicker than arriving, and eases IN — it accelerates away rather
// than drifting to a stop, matching the dealt card's own dismiss.
const DECK_EXIT_MS = 400;
// The teaser's own cards sit tilted; a card leaves at that angle and unwinds to
// the stack's as it arrives, so the two fans agree at the hand-off.
const TEASER_TILT = -7;

type FeedbackKind = 'like' | 'pass' | 'undo';

const FEEDBACK_META: Record<
  FeedbackKind,
  { label: string; icon: 'bookmarkFilled' | 'close' | 'undo'; bg: string }
> = {
  like: { label: 'Added to wishlist', icon: 'bookmarkFilled', bg: COLORS.success },
  pass: { label: 'Passed', icon: 'close', bg: COLORS.accent },
  undo: { label: 'Brought back', icon: 'undo', bg: COLORS.accent },
};

// Tinder-style deck over the ranked explore feed. Drag the top card: past the
// threshold it flings off (right = like → straight onto the wishlist,
// left = pass) and the swipe is recorded so the event never comes back;
// otherwise it springs home. The two cards behind rise into place as the top
// one leaves, and undo brings the last swiped card back.
export default function SwipeDeckScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  // The top card's own measurable wrapper — only the top card is tappable
  // (the two behind it are peeking, not pressable), so a single ref is enough.
  const topCardRef = useRef<View>(null);
  const {
    deck,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    swipe,
    undo,
    canUndo,
    premium,
    swipesLeft,
    outOfSwipes,
  } = useSwipeDeck();

  const top = deck[0];
  const topId = top?.id;
  const threshold = width * 0.28;

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  // Keep a few cards buffered under the visible three.
  useEffect(() => {
    if (!isLoading && deck.length < 5 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [deck.length, isLoading, hasNextPage, isFetchingNextPage]);

  const [feedback, setFeedback] = useState<{
    kind: FeedbackKind;
    key: number;
  } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFeedback = useCallback((kind: FeedbackKind) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback({ kind, key: Date.now() });
    feedbackTimer.current = setTimeout(() => setFeedback(null), 1200);
  }, []);
  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    []
  );

  // Runs on the JS thread once the fling-off animation lands: reset the
  // translation (the next card is already at full size at this point) and
  // record the swipe, which drops the card from the deck.
  const commitSwipe = useCallback(
    (eventId: string, direction: 'like' | 'pass') => {
      tx.value = 0;
      ty.value = 0;
      swipe(eventId, direction);
      showFeedback(direction);
    },
    [swipe, showFeedback]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!!topId && !outOfSwipes)
        .onUpdate((e) => {
          tx.value = e.translationX;
          ty.value = e.translationY * 0.4;
        })
        .onEnd((e) => {
          const flung =
            Math.abs(tx.value) > threshold || Math.abs(e.velocityX) > 900;
          if (flung && topId) {
            const basis = Math.abs(tx.value) > 4 ? tx.value : e.velocityX;
            const direction = basis > 0 ? 'like' : 'pass';
            const sign = basis > 0 ? 1 : -1;
            ty.value = withTiming(ty.value + 40, { duration: 230 });
            tx.value = withTiming(
              sign * width * 1.5,
              { duration: 230, easing: Easing.out(Easing.quad) },
              (finished) => {
                if (finished) runOnJS(commitSwipe)(topId, direction);
              }
            );
          } else {
            tx.value = withSpring(0, { damping: 16, stiffness: 180 });
            ty.value = withSpring(0, { damping: 16, stiffness: 180 });
          }
        }),
    [topId, width, threshold, commitSwipe, outOfSwipes]
  );

  // The ✕ / ♥ buttons replay the same fling the gesture would produce.
  function flingOut(direction: 'like' | 'pass') {
    if (!topId) return;
    if (outOfSwipes) {
      router.push('/premium?reason=swipes');
      return;
    }
    const sign = direction === 'like' ? 1 : -1;
    ty.value = withTiming(30, { duration: 320 });
    tx.value = withTiming(
      sign * width * 1.5,
      { duration: 320, easing: Easing.in(Easing.quad) },
      (finished) => {
        if (finished) runOnJS(commitSwipe)(topId, direction);
      }
    );
  }

  function onUndo() {
    // Rewind is a Mello+ perk.
    if (!premium) {
      router.push('/premium?reason=swipes');
      return;
    }
    const last = undo();
    if (!last) return;
    tx.value = 0;
    ty.value = 0;
    showFeedback('undo');
  }

  // ── The deck arriving from, and returning to, the map's teaser ────────────
  //
  // The teaser is a little fan of three tilted cards in the map's bottom-left
  // corner. Tapping it measures that fan and stores its rect (see
  // SwipeDeckTeaser); this screen deals its cards out of exactly that spot and
  // settles them back into it on the way out, so the fan reads as the deck
  // itself being picked up and put down rather than a screen that replaced it.
  //
  // 0 = stowed in the teaser, 1 = laid out on screen.
  const entry = useSharedValue(0);
  const origin = useUIStore((st) => st.swipeDeckOrigin);
  // Read inside `goBack`'s callback, which must not re-create with the store
  // value — the exit is decided by what opened the screen, not by what the
  // store says at the moment you press back.
  const originRef = useRef(origin);
  useEffect(() => {
    entry.value = withTiming(1, {
      duration: DECK_ENTRY_MS,
      easing: Easing.bezier(0.2, 0.7, 0.3, 1),
    });
  }, [entry]);

  // Where a card starts, relative to its resting place at screen centre. With
  // no origin the deck simply appears — a deep link or a tab jump has nothing
  // on screen to have come out of.
  // Leaving: the deck gathers itself back into the fan it came out of, then
  // the route pops. Reversed stagger — the cards behind lead and the top card
  // is last to go, so the deck closes the way a hand of cards is squared up
  // rather than the top card simply vanishing first.
  //
  // The origin is cleared on the way out: it belongs to the tap that opened
  // this, and a later entry from anywhere else must not fly out of a fan that
  // is no longer under the user's thumb.
  const goBack = useCallback(() => {
    const finish = () => {
      useUIStore.getState().setSwipeDeckOrigin(null);
      router.back();
    };
    if (!originRef.current) {
      finish();
      return;
    }
    entry.value = withTiming(
      0,
      { duration: DECK_EXIT_MS, easing: Easing.bezier(0.5, 0, 0.75, 0.3) },
      (done) => {
        if (done) runOnJS(finish)();
      }
    );
  }, [entry, router]);

  const from = useMemo(() => {
    if (!origin) return null;
    return {
      x: origin.x + origin.width / 2 - width / 2,
      y: origin.y + origin.height / 2 - height / 2,
      scale: Math.max(origin.width / width, 0.12),
    };
  }, [origin, width, height]);

  // One card's arrival. `depth` staggers it: the top card leads and the ones
  // behind follow a beat later, so the deck unfurls out of the fan instead of
  // three cards moving as one block. `lift` arcs it off the straight line, the
  // same shape the dealt card uses.
  function entryTransform(depth: number, rest: { x: number; y: number; rotate: number; scale: number }) {
    'worklet';
    if (!from) return { x: rest.x, y: rest.y, rotate: rest.rotate, scale: rest.scale, opacity: 1 };
    const start = depth * DECK_STAGGER;
    const p = interpolate(entry.value, [start, 1], [0, 1], Extrapolation.CLAMP);
    const lift = interpolate(p, [0, 0.5, 1], [0, -DECK_ARC, 0], Extrapolation.CLAMP);
    return {
      x: interpolate(p, [0, 1], [from.x, rest.x], Extrapolation.CLAMP),
      y: interpolate(p, [0, 1], [from.y, rest.y], Extrapolation.CLAMP) + lift,
      // Out of the teaser's own tilt and into the resting stack's.
      rotate: interpolate(p, [0, 1], [TEASER_TILT * (depth + 1), rest.rotate], Extrapolation.CLAMP),
      scale: interpolate(p, [0, 0.85, 1], [from.scale, rest.scale * 1.03, rest.scale], Extrapolation.CLAMP),
      opacity: interpolate(p, [0, 0.1], [0, 1], Extrapolation.CLAMP),
    };
  }

  const topStyle = useAnimatedStyle(() => {
    const e = entryTransform(0, { x: 0, y: 0, rotate: 0, scale: 1 });
    return {
      opacity: e.opacity,
      transform: [
        { translateX: e.x + tx.value },
        { translateY: e.y + ty.value },
        { rotate: `${e.rotate + (tx.value / width) * 12}deg` },
        { scale: e.scale },
      ],
    };
  });
  const likeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [14, threshold], [0, 1], Extrapolation.CLAMP),
    transform: [
      { rotate: '-14deg' },
      {
        scale: interpolate(
          tx.value,
          [14, threshold],
          [0.6, 1],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));
  const nopeStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      tx.value,
      [-threshold, -14],
      [1, 0],
      Extrapolation.CLAMP
    ),
    transform: [
      { rotate: '14deg' },
      {
        scale: interpolate(
          tx.value,
          [-threshold, -14],
          [1, 0.6],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  // How far the top card has committed (0..1); the cards behind rise with it.
  const rise = useDerivedValue(() =>
    Math.min(Math.abs(tx.value) / threshold, 1)
  );
  // The two cards behind the top one, on the SAME table the dealt card's stack
  // uses (`stackLayer`) rather than this screen's own hand-rolled numbers —
  // one messy stack in the app, not two that drift. `rise` still promotes them
  // a place as the top card is dragged away, so the deck breathes under your
  // finger.
  function restingLayer(depth: number, riseValue: number) {
    'worklet';
    const here = stackLayer(depth);
    const ahead = stackLayer(depth - 1);
    return {
      x: here.x + (ahead.x - here.x) * riseValue,
      y: here.y + (ahead.y - here.y) * riseValue,
      rotate: here.rotate + (ahead.rotate - here.rotate) * riseValue,
      scale: here.scale + (ahead.scale - here.scale) * riseValue,
    };
  }
  const secondStyle = useAnimatedStyle(() => {
    const e = entryTransform(1, restingLayer(1, rise.value));
    return {
      opacity: e.opacity,
      transform: [
        { translateX: e.x },
        { translateY: e.y },
        { rotate: `${e.rotate}deg` },
        { scale: e.scale },
      ],
    };
  });
  const thirdStyle = useAnimatedStyle(() => {
    const e = entryTransform(2, restingLayer(2, rise.value));
    return {
      opacity: e.opacity,
      transform: [
        { translateX: e.x },
        { translateY: e.y },
        { rotate: `${e.rotate}deg` },
        { scale: e.scale },
      ],
    };
  });

  const visible = deck.slice(0, 3);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Header */}
        <ScreenHeader
          title="Tonight's picks"
          onBack={goBack}
          subtitle={
            premium || outOfSwipes
              ? 'Swipe to save the vibe'
              : `${swipesLeft} free ${
                  swipesLeft === 1 ? 'swipe' : 'swipes'
                } left today`
          }
          backIcon="chevronDown"
          tone="dark"
          // The rounded bottom is this screen's own shape, not a header
          // variant — the deck sits directly beneath it.
          style={styles.headerShape}
          right={
            <WishlistButton
              size={40}
              iconSize={20}
              color={COLORS.white}
              style={styles.headerBtn}
            />
          }
        />

        {/* Deck */}
        <View style={styles.deckArea}>
          {isLoading ? (
            <Loader inline />
          ) : outOfSwipes ? (
            // Daily cap hit: the deck pauses until midnight — or Mello+.
            <View style={styles.cardWrap}>
              <View style={styles.placeholderCard}>
                <View style={[styles.emptyIcon, styles.premiumIcon]}>
                  <Icon
                    name="crown"
                    size={36}
                    color={PREMIUM_GOLD}
                    strokeWidth={2}
                  />
                </View>
                <Text style={styles.emptyTitle}>Out of swipes for today</Text>
                <Text style={styles.emptyText}>
                  Your 10 free swipes are used up — they reset at midnight.
                  Mello+ members swipe without limits.
                </Text>
                <Button
                  variant="primary"
                  label="Get Mello+ · unlimited swipes"
                  height={44}
                  onPress={() => router.push('/premium?reason=swipes')}
                  style={{ marginTop: SPACING[2] }}
                />
              </View>
            </View>
          ) : visible.length === 0 ? (
            // The deck never vanishes: an empty-deck card keeps the frame (and
            // the buttons below stay, so undo can still bring swipes back).
            <View style={styles.cardWrap}>
              <View style={styles.placeholderCard}>
                <View style={styles.emptyIcon}>
                  <Icon
                    name={isError ? 'warning' : 'check'}
                    size={36}
                    color={COLORS.primary}
                    strokeWidth={2.4}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {isError ? "Couldn't load events" : "You're all caught up!"}
                </Text>
                <Text style={styles.emptyText}>
                  {isError
                    ? 'Something went wrong — give it another go.'
                    : 'No more events to swipe right now. Please visit again after some time — new plans pop up all day.'}
                </Text>
                <Button
                  label={isError ? 'Retry' : 'Check again'}
                  height={44}
                  onPress={() => refetch()}
                  style={{ marginTop: SPACING[2] }}
                />
              </View>
            </View>
          ) : (
            visible
              .map((event, i) => {
                if (i === 0) {
                  return (
                    <GestureDetector key={event.id} gesture={pan}>
                      <Animated.View style={[styles.cardWrap, topStyle]}>
                        {/* Plain View, not the Animated.View above: the ref
                            this measures needs a real host node — see
                            useOpenOverlay's comment on why an animated
                            component's ref isn't one to rely on for
                            measureInWindow. */}
                        <View ref={topCardRef} style={{ flex: 1 }} collapsable={false}>
                          {/* The tap target is a wrapper, not a prop on
                              `EventCard`: the card is a presentational object
                              and the two places that render it want different
                              things from a tap (here, open the detail; in a
                              dealt stack, flip). */}
                          <Pressable
                            style={styles.cardPress}
                            onPress={() => {
                              // The dealt card's deck is the swipe deck itself,
                              // starting at this card — and its source is
                              // 'swipeDeck', so a swipe on it delegates to this
                              // screen's own quota-spending swipe() rather than
                              // the generic browse advance/save.
                              const ids = deck.map((e) => e.id);
                              const node = topCardRef.current;
                              const openWith = (origin: DealtOrigin | null) =>
                                useUIStore
                                  .getState()
                                  .dealCard(ids, 0, origin, 'swipeDeck');
                              if (!node) {
                                openWith(null);
                                return;
                              }
                              node.measureInWindow((x, y, width, height) =>
                                openWith({ x, y, width, height })
                              );
                            }}
                          >
                            <EventCard event={event} />
                          </Pressable>
                        </View>
                        <Animated.View
                          pointerEvents="none"
                          style={[styles.stamp, styles.likeStamp, likeStampStyle]}
                        >
                          <Text
                            style={[styles.stampText, { color: COLORS.success }]}
                          >
                            LIKE
                          </Text>
                        </Animated.View>
                        <Animated.View
                          pointerEvents="none"
                          style={[styles.stamp, styles.nopeStamp, nopeStampStyle]}
                        >
                          <Text
                            style={[styles.stampText, { color: COLORS.error }]}
                          >
                            NOPE
                          </Text>
                        </Animated.View>
                      </Animated.View>
                    </GestureDetector>
                  );
                }
                return (
                  <Animated.View
                    key={event.id}
                    style={[styles.cardWrap, i === 1 ? secondStyle : thirdStyle]}
                  >
                    <EventCard event={event} blurred={false} />
                  </Animated.View>
                );
              })
              .reverse()
          )}

          {/* Swipe-result toast */}
          {feedback && (
            <Animated.View
              key={feedback.key}
              entering={ZoomIn.springify().damping(15)}
              exiting={FadeOut.duration(160)}
              style={[
                styles.feedbackPill,
                { backgroundColor: FEEDBACK_META[feedback.kind].bg },
              ]}
              pointerEvents="none"
            >
              <Icon
                name={FEEDBACK_META[feedback.kind].icon}
                size={15}
                color="#fff"
                strokeWidth={2.4}
              />
              <Text style={styles.feedbackText}>
                {FEEDBACK_META[feedback.kind].label}
              </Text>
            </Animated.View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <PressableScale
            scaleTo={0.85}
            style={[styles.actionBtn, !top && styles.actionDisabled]}
            onPress={() => flingOut('pass')}
            accessibilityRole="button"
            accessibilityLabel="Pass on this event"
          >
            <Icon name="close" size={28} color={COLORS.textSecondary} strokeWidth={2.4} />
          </PressableScale>
          <PressableScale
            scaleTo={0.85}
            style={[styles.actionBtn, styles.likeBtn, !top && styles.actionDisabled]}
            onPress={() => flingOut('like')}
            accessibilityRole="button"
            accessibilityLabel="Add this event to your wishlist"
          >
            <Icon name="bookmarkFilled" size={28} color="#fff" strokeWidth={2.4} />
          </PressableScale>
          <PressableScale
            scaleTo={0.85}
            style={[
              styles.actionBtn,
              styles.undoBtn,
              // Free users always tap through (to the Mello+ paywall).
              premium && !canUndo && styles.actionDisabled,
            ]}
            onPress={onUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo last swipe"
          >
            <Icon name="undo" size={22} color="#fff" strokeWidth={2.2} />
            {!premium && (
              <View style={styles.undoCrown}>
                <Icon name="crown" size={10} color={PREMIUM_GOLD} strokeWidth={2.4} />
              </View>
            )}
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  headerShape: {
    // No safe-area inset here: this screen is presented as a modal, so the card
    // already clears the notch. Adding insets.top on top of that double-padded
    // the header by the full status-bar height.
    paddingTop: SPACING[3.5],
    paddingBottom: SPACING[4],
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerBtn: { backgroundColor: 'rgba(255,255,255,0.12)' },
  deckArea: {
    flex: 1,
    margin: SPACING[4],
    marginTop: SPACING[2.5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPress: { flex: 1 },
  cardWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  stamp: {
    position: 'absolute',
    top: 24,
    borderWidth: 4,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  likeStamp: { left: 20, borderColor: COLORS.success },
  nopeStamp: { right: 20, borderColor: COLORS.error },
  stampText: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.h1,
    letterSpacing: 2,
  },
  feedbackPill: {
    position: 'absolute',
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    height: 38,
    paddingHorizontal: SPACING[4],
    borderRadius: RADIUS.full,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  feedbackText: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.bodySm, color: '#fff' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[5],
    paddingTop: SPACING[1.5],
    paddingBottom: SPACING[6],
  },
  actionBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  likeBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    borderWidth: 0,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  undoBtn: {
    backgroundColor: COLORS.accent,
    borderWidth: 0,
  },
  actionDisabled: { opacity: 0.4 },
  premiumIcon: { backgroundColor: PREMIUM_GOLD_TINT },
  undoCrown: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: RADIUS.xs,
    backgroundColor: PREMIUM_GOLD_TINT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.surface,
  },
  placeholderCard: {
    flex: 1,
    borderRadius: RADIUS['3xl'],
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2.5],
    paddingHorizontal: SPACING[7],
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[1.5],
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 250,
  },
});
