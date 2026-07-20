import { useCallback, useMemo, useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useWrapDeck } from '@/hooks/useWrapDeck';
import { useFriends } from '@/hooks/useFriends';
import RateCard from '@/components/wrap/RateCard';
import { NoteComposer } from '@/components/wrap/NoteComposer';
import { CompleteMoment } from '@/components/wrap/CompleteMoment';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { CoAttendee } from '@/types/models';
import {
  Button,
  Icon,
  Loader,
  PressableScale,
  Screen,
  ScreenHeader,
} from '@/components/ui';

// Rate the people you met: swipe right = thumbs up, left = thumbs down
// (private). Same deck engine as the events swipe screen.
export default function RatePeopleScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { width } = useWindowDimensions();
  const { deck, total, isLoading, rate, undo, lastRated } = useWrapDeck(eventId);
  const { sendRequest, relationshipWith } = useFriends();

  const [noteFor, setNoteFor] = useState<CoAttendee | null>(null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

  const top = deck[0];
  const topId = top?.id;
  const threshold = width * 0.28;

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const commitRate = useCallback(
    (attendee: CoAttendee, rating: 'up' | 'down') => {
      tx.value = 0;
      ty.value = 0;
      rate.mutate({ attendee, rating });
    },
    [rate]
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!!topId)
        .onUpdate((e) => {
          tx.value = e.translationX;
          ty.value = e.translationY * 0.4;
        })
        .onEnd((e) => {
          const flung =
            Math.abs(tx.value) > threshold || Math.abs(e.velocityX) > 900;
          if (flung && top) {
            const basis = Math.abs(tx.value) > 4 ? tx.value : e.velocityX;
            const rating = basis > 0 ? 'up' : 'down';
            const sign = basis > 0 ? 1 : -1;
            ty.value = withTiming(ty.value + 40, { duration: 230 });
            tx.value = withTiming(
              sign * width * 1.5,
              { duration: 230, easing: Easing.out(Easing.quad) },
              (finished) => {
                if (finished) runOnJS(commitRate)(top, rating);
              }
            );
          } else {
            tx.value = withSpring(0, { damping: 16, stiffness: 180 });
            ty.value = withSpring(0, { damping: 16, stiffness: 180 });
          }
        }),
    [topId, top, width, threshold, commitRate]
  );

  function flingOut(rating: 'up' | 'down') {
    if (!top) return;
    const sign = rating === 'up' ? 1 : -1;
    ty.value = withTiming(30, { duration: 320 });
    tx.value = withTiming(
      sign * width * 1.5,
      { duration: 320, easing: Easing.in(Easing.quad) },
      (finished) => {
        if (finished) runOnJS(commitRate)(top, rating);
      }
    );
  }

  function onUndo() {
    if (!lastRated) return;
    tx.value = 0;
    ty.value = 0;
    undo.mutate(lastRated.attendee.id);
  }

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { rotate: `${(tx.value / width) * 12}deg` },
    ],
  }));
  const upStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [14, threshold], [0, 1], Extrapolation.CLAMP),
    transform: [
      { rotate: '-14deg' },
      {
        scale: interpolate(tx.value, [14, threshold], [0.6, 1], Extrapolation.CLAMP),
      },
    ],
  }));
  const downStampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-threshold, -14], [1, 0], Extrapolation.CLAMP),
    transform: [
      { rotate: '14deg' },
      {
        scale: interpolate(tx.value, [-threshold, -14], [1, 0.6], Extrapolation.CLAMP),
      },
    ],
  }));

  const rise = useDerivedValue(() =>
    Math.min(Math.abs(tx.value) / threshold, 1)
  );
  const secondStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: 16 * (1 - rise.value) },
      { scale: 0.955 + 0.045 * rise.value },
    ],
  }));

  const visible = deck.slice(0, 2);
  const ratedCount = total - deck.length;
  const allDone = !isLoading && total > 0 && deck.length === 0;

  return (
    <Screen>
      <ScreenHeader
        title="Who did you meet?"
        subtitle={`Right 👍 · left 👎 (always private) · ${ratedCount}/${total} rated`}
        backIcon="chevronDown"
        tone="transparent"
      />

      <View style={styles.deckArea}>
        {isLoading ? (
          <Loader inline />
        ) : allDone ? (
          <View style={styles.doneWrap}>
            <CompleteMoment
              title="Everyone rated!"
              sub="Thumbs up land on their profile. Thumbs down stay between you and no one."
            >
              <Button
                variant="tertiary"
                label="Back to the wrap"
                height={44}
                onPress={() => router.back()}
                style={{ marginTop: SPACING[3], alignSelf: 'stretch' }}
              />
            </CompleteMoment>
          </View>
        ) : total === 0 ? (
          <View style={styles.doneWrap}>
            <Text style={styles.emptyTitle}>No one else was there</Text>
            <Text style={styles.emptyText}>
              Ratings unlock when an event has other attendees.
            </Text>
            <Button
variant="tertiary" label="Go back" height={44} onPress={() => router.back()} />
          </View>
        ) : (
          visible
            .map((attendee, i) => {
              const rel = relationshipWith(attendee.id);
              const friendState = requestedIds.has(attendee.id)
                ? 'request_sent'
                : rel.status;
              if (i === 0) {
                return (
                  <GestureDetector key={attendee.id} gesture={pan}>
                    <Animated.View style={[styles.cardWrap, topStyle]}>
                      <RateCard
                        attendee={attendee}
                        friendState={friendState as any}
                        onAddFriend={() => {
                          setRequestedIds((s) => new Set(s).add(attendee.id));
                          sendRequest.mutate(attendee.id);
                        }}
                      />
                      <Animated.View
                        pointerEvents="none"
                        style={[styles.stamp, styles.upStamp, upStampStyle]}
                      >
                        <Text style={styles.stampEmoji}>👍</Text>
                      </Animated.View>
                      <Animated.View
                        pointerEvents="none"
                        style={[styles.stamp, styles.downStamp, downStampStyle]}
                      >
                        <Text style={styles.stampEmoji}>👎</Text>
                      </Animated.View>
                    </Animated.View>
                  </GestureDetector>
                );
              }
              return (
                <Animated.View
                  key={attendee.id}
                  style={[styles.cardWrap, secondStyle]}
                >
                  <RateCard attendee={attendee} />
                </Animated.View>
              );
            })
            .reverse()
        )}
      </View>

      {/* Actions */}
      {!allDone && total > 0 && (
        <View style={styles.actions}>
          <PressableScale
            scaleTo={0.85}
            style={[styles.actionBtn, styles.smallActionBtn, !lastRated && styles.actionDisabled]}
            onPress={onUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo last rating"
          >
            <Icon name="undo" size={20} color={COLORS.warning} strokeWidth={2.2} />
          </PressableScale>
          <PressableScale
            scaleTo={0.85}
            style={[styles.actionBtn, !top && styles.actionDisabled]}
            onPress={() => flingOut('down')}
            accessibilityRole="button"
            accessibilityLabel="Thumbs down, stays private"
          >
            <Text style={styles.actionEmoji}>👎</Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.85}
            style={[styles.actionBtn, styles.smallActionBtn, !top && styles.actionDisabled]}
            onPress={() => top && setNoteFor(top)}
            accessibilityRole="button"
            accessibilityLabel="Leave them a private note"
          >
            <Icon name="edit" size={19} color={COLORS.accent} strokeWidth={2} />
          </PressableScale>
          <PressableScale
            scaleTo={0.85}
            style={[styles.actionBtn, !top && styles.actionDisabled]}
            onPress={() => flingOut('up')}
            accessibilityRole="button"
            accessibilityLabel="Thumbs up"
          >
            <Text style={styles.actionEmoji}>👍</Text>
          </PressableScale>
        </View>
      )}
      <NoteComposer
        eventId={eventId!}
        recipient={noteFor}
        visible={!!noteFor}
        onClose={() => setNoteFor(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  deckArea: {
    flex: 1,
    margin: SPACING[4],
    marginTop: SPACING[2.5],
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
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING[3.5],
    paddingVertical: SPACING[1.5],
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  upStamp: { left: 20, borderColor: COLORS.success },
  downStamp: { right: 20, borderColor: COLORS.error },
  stampEmoji: { fontSize: TYPE_SIZE.display },
  doneWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2.5],
    alignSelf: 'stretch',
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
    marginBottom: SPACING[1.5],
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[4],
    paddingTop: SPACING[1.5],
    paddingBottom: SPACING[4],
  },
  actionBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F182C',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  smallActionBtn: { width: 50, height: 50, borderRadius: 25 },
  actionDisabled: { opacity: 0.4 },
  actionEmoji: { fontSize: TYPE_SIZE.h1 },
});
