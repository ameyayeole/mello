import { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
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
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import { useWrapDeck } from '@/hooks/useWrapDeck';
import { useFriends } from '@/hooks/useFriends';
import { useWrap } from '@/hooks/useWrap';
import { useWrapFlowStore } from '@/stores/wrapFlowStore';
import { useAuthStore } from '@/stores/authStore';
import {
  getCoAttendees,
  getMyVotes,
  reportAttendee,
} from '@/services/wrap.service';
import { DownReason, isSafetyReason } from '@/utils/wrapRating';
import { ReasonChips } from '@/components/wrap/ReasonChips';
import { showError } from '@/utils/errors';
import RateCard from '@/components/wrap/RateCard';
import { NoteComposer } from '@/components/wrap/NoteComposer';
import { SUPERLATIVES } from '@/constants/superlatives';
import { COLORS, inkAlpha } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { CoAttendee, SuperlativeCategory } from '@/types/models';
import {
  Avatar,
  Button,
  Icon,
  Loader,
  PressableScale,
  Sheet,
} from '@/components/ui';
import { themedStyles } from '@/theme';

// Above this many people the deck stops being a nice review of the night and
// starts being a chore.
//
// The flow is mandatory to unlock the wrap, and a chore standing in front of a
// gate gets RUSHED — people thumbs-up everyone to get through. A rushed rating
// is worse than a skipped one, because it looks like signal. So the escape is
// offered rather than the deck shortened.
//
// 15 is a judgement call, not a measurement.
const SKIP_ABOVE = 15;

// Rate the people you met: swipe right = thumbs up, left = thumbs down.
// Once the deck empties, the night's awards appear under it — same step,
// because they are the same question asked twice about the same people.
//
// No props — that is what lets memo hold this against the flow's re-renders,
// and this step owns the gesture deck, so it is the one that most needs it.
export const StepRate = memo(function StepRate() {
  const eventId = useWrapFlowStore((s) => s.eventId) ?? undefined;
  const next = useWrapFlowStore((s) => s.next);
  const user = useAuthStore((s) => s.user);
  const { width } = useWindowDimensions();
  const { deck, total, isLoading, rate, undo, lastRated } = useWrapDeck(eventId);
  const { sendRequest, relationshipWith } = useFriends();
  const { vote } = useWrap(eventId);

  const [noteFor, setNoteFor] = useState<CoAttendee | null>(null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState<SuperlativeCategory | null>(null);
  // Who was just thumbed down, and so who the reason chips are about.
  const [downFor, setDownFor] = useState<CoAttendee | null>(null);

  function handleReason(reason: DownReason | null) {
    const about = downFor;
    setDownFor(null);
    if (!reason || !about || !user) return;
    // Taste is recorded nowhere. Only a safety signal files a report — routing
    // "not my vibe" into a moderation queue would treat a preference as a
    // concern about someone's conduct.
    if (!isSafetyReason(reason)) return;
    reportAttendee({
      eventId: eventId!,
      reporterId: user.id,
      reportedId: about.id,
      reason,
    }).catch((e) => showError(e, 'Could not send that'));
  }

  const top = deck[0];
  const topId = top?.id;
  const threshold = width * 0.28;

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const commitRate = useCallback(
    (attendee: CoAttendee, rating: 'up' | 'down') => {
      tx.value = 0;
      ty.value = 0;
      // The rating saves FIRST, before any chip is offered. Ask first and
      // dismissing the row would silently drop the rating.
      rate.mutate({ attendee, rating });
      if (rating === 'down') setDownFor(attendee);
    },
    // tx/ty are listed where the rate route omitted them. Shared values have a
    // stable identity, so this changes nothing at runtime — it just keeps the
    // moved copy from adding two lint warnings the original already carries.
    [rate, tx, ty]
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
    [topId, top, width, threshold, commitRate, tx, ty]
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

  // ── Awards ────────────────────────────────────────────────────────────────
  // "Awards" on screen, `superlative*` in the schema. Renaming the table, the
  // enum, the RPC and SuperlativeBadge to change a label is a large blast
  // radius for zero user benefit — spec §5.2. Rename the strings, not the
  // schema.
  const attendeesQuery = useQuery({
    queryKey: queryKeys.wrapAttendees.of(eventId, user?.id),
    queryFn: () => getCoAttendees(eventId!, user!.id),
    enabled: !!eventId && !!user,
  });
  const votesQuery = useQuery({
    queryKey: ['wrapVotes', eventId, user?.id],
    queryFn: () => getMyVotes(eventId!, user!.id),
    enabled: !!eventId && !!user,
  });

  const myVotes = useMemo(() => {
    const map = new Map<SuperlativeCategory, string>();
    for (const v of votesQuery.data ?? []) map.set(v.category, v.votee_id);
    return map;
  }, [votesQuery.data]);

  const attendeeById = useMemo(() => {
    const map = new Map<string, CoAttendee>();
    for (const a of attendeesQuery.data ?? []) map.set(a.id, a);
    return map;
  }, [attendeesQuery.data]);

  function castVote(category: SuperlativeCategory, voteeId: string) {
    vote.mutate({ category, voteeId });
    votesQuery.refetch();
    setPicking(null);
  }

  const visible = deck.slice(0, 2);
  const deckDone = !isLoading && deck.length === 0;

  // The awards do NOT gate this. Four forced choices about who was most likely
  // to host next is where people stop answering and start clicking, and a
  // winner nobody meant is still shown as a winner. A category needs 3+ votes
  // to resolve (033:140), which only works if the votes are willing.
  if (deckDone) {
    return (
      <ScrollView
        contentContainerStyle={styles.doneScroll}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.awardsTitle}>
            {total === 0 ? 'No one else was there' : 'Hand out the awards'}
          </Text>
          <Text style={styles.awardsSub}>
            {total === 0
              ? 'Ratings unlock when an event has other attendees.'
              : 'Optional, and anonymous. Winners show once an award has 3 votes.'}
          </Text>
        </View>

        {total > 0 &&
          SUPERLATIVES.map((s) => {
            const votedFor = myVotes.get(s.id);
            const votee = votedFor ? attendeeById.get(votedFor) : null;
            return (
              <View key={s.id}>
                <PressableScale
                  scaleTo={0.98}
                  style={[styles.card, votedFor && styles.cardVoted]}
                  onPress={() => setPicking(s.id)}
                  accessibilityRole="button"
                  accessibilityLabel={s.label}
                >
                  {/* The award's own emoji, from SUPERLATIVES. Kept rather than
                      swapped for Icon: the shipped recap's SuperlativeBadge
                      draws the same glyph from the same constant, and two
                      surfaces disagreeing about what "MVP" looks like is worse
                      than an emoji. */}
                  <Text style={styles.cardEmoji}>{s.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{s.label}</Text>
                    <Text style={styles.cardSub}>
                      {votee ? `Your pick: ${votee.name}` : s.hint}
                    </Text>
                  </View>
                  {votedFor ? (
                    <View style={styles.votedBadge}>
                      <Icon name="check" size={14} color="#fff" strokeWidth={3} />
                    </View>
                  ) : (
                    <Icon name="chevronRight" size={18} color={inkAlpha(0.35)} />
                  )}
                </PressableScale>
              </View>
            );
          })}

        <Button
          label="Continue"
          onPress={next}
          style={{ marginTop: SPACING[2] }}
        />

        {/* Attendee picker */}
        <Sheet
          visible={!!picking}
          onClose={() => setPicking(null)}
          style={styles.pickerCard}
        >
          <Text style={styles.pickerTitle}>
            {picking
              ? `${SUPERLATIVES.find((s) => s.id === picking)?.emoji} ${
                  SUPERLATIVES.find((s) => s.id === picking)?.label
                }`
              : ''}
          </Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {(attendeesQuery.data ?? []).map((a) => {
              const isPick = picking ? myVotes.get(picking) === a.id : false;
              return (
                <PressableScale
                  key={a.id}
                  scaleTo={0.98}
                  style={styles.pickerRow}
                  onPress={() => picking && castVote(picking, a.id)}
                >
                  <Avatar name={a.name} photoUrl={a.photo_url} size={40} />
                  <Text style={styles.pickerName}>
                    {a.name}
                    {a.isHost ? '  ·  Host' : ''}
                  </Text>
                  {isPick && (
                    <Icon name="check" size={17} color={COLORS.success} strokeWidth={2.6} />
                  )}
                </PressableScale>
              );
            })}
          </ScrollView>
        </Sheet>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.deckArea}>
        {isLoading ? (
          <Loader inline />
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
                        // Nested inside the card's own PressableScale, the same
                        // way Add friend already is — the inner press wins the
                        // responder, so this does not also open the profile.
                        onLeaveNote={() => setNoteFor(attendee)}
                      />
                      <Animated.View
                        pointerEvents="none"
                        style={[styles.stamp, styles.upStamp, upStampStyle]}
                      >
                        <Icon
                          name="thumbsUp"
                          size={30}
                          color={COLORS.success}
                          strokeWidth={2.4}
                        />
                      </Animated.View>
                      <Animated.View
                        pointerEvents="none"
                        style={[styles.stamp, styles.downStamp, downStampStyle]}
                      >
                        <Icon
                          name="thumbsDown"
                          size={30}
                          color={COLORS.error}
                          strokeWidth={2.4}
                        />
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

      {downFor ? (
        <ReasonChips name={downFor.name} onPick={handleReason} />
      ) : (
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
          accessibilityLabel="Thumbs down"
        >
          <Icon name="thumbsDown" size={26} color={COLORS.error} strokeWidth={2.4} />
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
          <Icon name="thumbsUp" size={26} color={COLORS.success} strokeWidth={2.4} />
        </PressableScale>
      </View>
      )}

      {/* Only offered on a deck long enough to become a chore. Skipping still
          completes the flow — it does not block the contributor marker. */}
      {total + 1 > SKIP_ABOVE && (
        <View style={styles.skipRow}>
          <Button variant="tertiary" label="Skip the rest" height={40} onPress={next} />
        </View>
      )}

      <NoteComposer
        eventId={eventId!}
        recipient={noteFor}
        visible={!!noteFor}
        onClose={() => setNoteFor(null)}
      />
    </View>
  );
});

const styles = themedStyles(() => ({
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
  skipRow: { paddingHorizontal: SPACING[4], paddingBottom: SPACING[3] },

  doneScroll: {
    padding: SPACING[4],
    paddingTop: SPACING[2.5],
    gap: SPACING[3],
    paddingBottom: SPACING[7],
  },
  awardsTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    letterSpacing: -0.44,
    color: COLORS.textPrimary,
  },
  awardsSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginTop: SPACING[1.5],
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING[4],
  },
  cardVoted: {
    borderColor: 'rgba(31,164,99,0.35)',
    backgroundColor: 'rgba(31,164,99,0.05)',
  },
  cardEmoji: { fontSize: TYPE_SIZE.h1 },
  cardTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textPrimary,
  },
  cardSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  votedBadge: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCard: { padding: SPACING[5] },
  pickerTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.section,
    letterSpacing: -0.34,
    color: COLORS.textPrimary,
    marginBottom: SPACING[3],
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingVertical: SPACING[2],
  },
  pickerName: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textPrimary,
  },
}));
