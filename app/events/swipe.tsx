import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import SwipeCard from '@/components/events/SwipeCard';
import WishlistButton from '@/components/events/WishlistButton';
import EventBottomSheet, {
  EventBottomSheetRef,
} from '@/components/events/EventBottomSheet';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { PREMIUM_GOLD, PREMIUM_GOLD_TINT } from '@/utils/premium';
import {
  Button,
  Icon,
  Loader,
  PressableScale,
  ScreenHeader,
} from '@/components/ui';

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
  const { width } = useWindowDimensions();
  const sheetRef = useRef<EventBottomSheetRef>(null);
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

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${(tx.value / width) * 12}deg` },
    ],
  }));
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
  const secondStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: 16 * (1 - rise.value) },
      { scale: 0.955 + 0.045 * rise.value },
    ],
  }));
  const thirdStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: 32 - 16 * rise.value },
      { scale: 0.91 + 0.045 * rise.value },
    ],
  }));

  const visible = deck.slice(0, 3);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Header */}
        <ScreenHeader
          title="Tonight's picks"
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
                  style={{ marginTop: 8 }}
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
                  style={{ marginTop: 8 }}
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
                        <SwipeCard
                          event={event}
                          onPress={() => sheetRef.current?.open(event.id)}
                        />
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
                    <SwipeCard event={event} />
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

      <EventBottomSheet ref={sheetRef} />
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
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerBtn: { backgroundColor: 'rgba(255,255,255,0.12)' },
  deckArea: {
    flex: 1,
    margin: 16,
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  likeStamp: { left: 20, borderColor: COLORS.success },
  nopeStamp: { right: 20, borderColor: COLORS.error },
  stampText: {
    fontFamily: FONTS.heavy,
    fontSize: 30,
    letterSpacing: 2,
  },
  feedbackPill: {
    position: 'absolute',
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 100,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  feedbackText: { fontFamily: FONTS.bold, fontSize: 13.5, color: '#fff' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    paddingTop: 6,
    paddingBottom: 26,
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
    borderRadius: 9,
    backgroundColor: PREMIUM_GOLD_TINT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.surface,
  },
  placeholderCard: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28,
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
    marginBottom: 6,
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 250,
  },
});
