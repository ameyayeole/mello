import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { PressableScale, Icon } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';
import { usePoll, useCastVote } from '@/hooks/usePoll';
import { PollOption } from '@/types/models';

// Bars grow from 0 on the first render of the result state (spec §12).
const BAR_MS = 520;

// "closes in 2d / 5h / 12m", or "<1m"; caller uses "Final" once closed.
function closesInLabel(closesAt: string): string {
  const ms = new Date(closesAt).getTime() - Date.now();
  if (ms <= 0) return 'Final';
  const mins = Math.floor(ms / 60000);
  if (mins >= 1440) return `closes in ${Math.floor(mins / 1440)}d`;
  if (mins >= 60) return `closes in ${Math.floor(mins / 60)}h`;
  if (mins >= 1) return `closes in ${mins}m`;
  return 'closes in <1m';
}

// One result row: a bar that animates from 0 to its share, the label, the
// percentage, and a check when it's the viewer's pick.
function ResultBar({
  option,
  total,
  mine,
}: {
  option: PollOption;
  total: number;
  mine: boolean;
}) {
  const share = total > 0 ? option.vote_count / total : 0;
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withTiming(share, { duration: BAR_MS, easing: Easing.out(Easing.cubic) });
  }, [grow, share]);
  const barStyle = useAnimatedStyle(() => ({
    width: `${grow.value * 100}%`,
  }));

  return (
    <View style={styles.resultRow}>
      <Animated.View
        style={[styles.bar, mine ? styles.barMine : styles.barOther, barStyle]}
        pointerEvents="none"
      />
      <View style={styles.resultContent}>
        <Text style={styles.resultLabel} numberOfLines={1}>
          {option.label}
        </Text>
        {mine ? (
          <Icon name="check" size={14} color={COLORS.primary} strokeWidth={2.4} />
        ) : null}
        <Text style={styles.resultPct}>{Math.round(share * 100)}%</Text>
      </View>
    </View>
  );
}

// The poll body of a type='poll' post. Before voting (and while open): the
// question + tappable option pills, no counts. After voting OR once closed:
// animated result bars, the viewer's pick marked, and a votes/closes footer.
export function PollCard({ postId, question }: { postId: string; question: string }) {
  const poll = usePoll(postId);
  const vote = useCastVote(postId);

  const closed = poll.data ? new Date(poll.data.closes_at) <= new Date() : false;
  const voted = !!poll.data?.my_option_id;
  const showResults = voted || closed;
  const total = poll.data?.options.reduce((s, o) => s + o.vote_count, 0) ?? 0;

  return (
    <View style={styles.wrap}>
      {question ? <Text style={styles.question}>{question}</Text> : null}

      {poll.isLoading || !poll.data ? (
        <View style={styles.skeleton}>
          <View style={styles.skelRow} />
          <View style={styles.skelRow} />
        </View>
      ) : showResults ? (
        <>
          {poll.data.options.map((o) => (
            <ResultBar
              key={o.id}
              option={o}
              total={total}
              mine={o.id === poll.data!.my_option_id}
            />
          ))}
          <Text style={styles.footer}>
            {total} vote{total === 1 ? '' : 's'} ·{' '}
            {closed ? 'Final' : closesInLabel(poll.data.closes_at)}
          </Text>
        </>
      ) : (
        <>
          {poll.data.options.map((o) => (
            <PressableScale
              key={o.id}
              scaleTo={0.98}
              disabled={vote.isPending}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                vote.mutate(o.id);
              }}
              style={styles.voteRow}
              accessibilityRole="button"
              accessibilityLabel={`Vote for ${o.label}`}
            >
              <Text style={styles.voteLabel} numberOfLines={1}>
                {o.label}
              </Text>
            </PressableScale>
          ))}
          <Text style={styles.footer}>{closesInLabel(poll.data.closes_at)}</Text>
        </>
      )}
    </View>
  );
}

const ROW_HEIGHT = 44;

const styles = StyleSheet.create({
  wrap: { gap: SPACING[2] },
  question: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    lineHeight: TYPE_SIZE.body * 1.35,
    color: COLORS.textPrimary,
  },

  // Vote mode — a plain inset pill per option.
  voteRow: {
    height: ROW_HEIGHT,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.inkSubtle,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    paddingHorizontal: SPACING[3.5],
  },
  voteLabel: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
  },

  // Result mode — label over a growing bar.
  resultRow: {
    // Faint track; the bar (a darker/coral fill) grows over it so both the
    // filled share and the remainder are legible on the panel-glass card.
    height: ROW_HEIGHT,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.inkFaint,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: RADIUS.md },
  barMine: { backgroundColor: COLORS.primaryTint },
  barOther: { backgroundColor: COLORS.chipGrab },
  resultContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    paddingHorizontal: SPACING[3.5],
  },
  resultLabel: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
  },
  resultPct: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },

  footer: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
    marginTop: SPACING[0.5],
  },

  skeleton: { gap: SPACING[2] },
  skelRow: {
    height: ROW_HEIGHT,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.inkSubtle,
  },
});
