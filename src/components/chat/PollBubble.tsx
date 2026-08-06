import { View, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS, inkAlpha } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon, PressableScale } from '@/components/ui';
import type { MessagePoll } from '@/types/models';
import { themedStyles } from '@/theme';

// A poll in the thread: the question, then either the options to tap or the
// results, depending on whether this viewer has voted.
//
// Full width rather than a bubble tucked to one side. A poll is addressed to the
// room, not to the person opposite you, and hanging it off the sender's edge
// would make a group's decision look like one member's remark. Same reasoning as
// the announcement card on this screen.
//
// The bars animate from zero on first paint, which is also what makes a vote
// feel like it landed: your tap flips the card to results and the bars grow.

const BAR_MS = 460;

function ResultBar({
  label,
  votes,
  total,
  mine,
}: {
  label: string;
  votes: number;
  total: number;
  mine: boolean;
}) {
  const share = total > 0 ? votes / total : 0;
  const grow = useSharedValue(0);

  useEffect(() => {
    grow.value = withTiming(share, {
      duration: BAR_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [share, grow]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${grow.value * 100}%`,
  }));

  return (
    <View style={styles.result}>
      <View style={styles.track}>
        <Animated.View
          style={[styles.fill, mine && styles.fillMine, fillStyle]}
        />
        <View style={styles.resultRow}>
          <Text style={styles.resultLabel} numberOfLines={1}>
            {label}
          </Text>
          {mine ? (
            <Icon name="check" size={13} color={COLORS.primary} strokeWidth={2.6} />
          ) : null}
          <Text style={styles.resultPct}>{Math.round(share * 100)}%</Text>
        </View>
      </View>
    </View>
  );
}

export default function PollBubble({
  question,
  poll,
  onVote,
  senderName,
  showName,
}: {
  question: string;
  // Undefined while the options are still loading, or on an optimistic message
  // whose poll rows do not exist on the server yet.
  poll?: MessagePoll;
  onVote: (optionId: string) => void;
  senderName?: string | null;
  showName?: boolean;
}) {
  const total = poll?.options.reduce((sum, o) => sum + o.vote_count, 0) ?? 0;
  const voted = !!poll?.my_option_id;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Icon name="poll" size={15} color={COLORS.primary} strokeWidth={2.2} />
        <Text style={styles.eyebrow}>
          Poll{showName && senderName ? ` · ${senderName}` : ''}
        </Text>
      </View>

      <Text style={styles.question}>{question}</Text>

      {!poll ? (
        // The question is already on screen; the options are one round trip
        // behind it. Two grey rows rather than a spinner, for the same reason
        // every other list in the app now uses bones.
        <View style={styles.pending}>
          <View style={styles.pendingRow} />
          <View style={styles.pendingRow} />
        </View>
      ) : voted ? (
        <View style={styles.results}>
          {poll.options.map((option) => (
            <ResultBar
              key={option.id}
              label={option.label}
              votes={option.vote_count}
              total={total}
              mine={poll.my_option_id === option.id}
            />
          ))}
        </View>
      ) : (
        <View style={styles.options}>
          {poll.options.map((option) => (
            <PressableScale
              key={option.id}
              scaleTo={0.98}
              style={styles.option}
              onPress={() => onVote(option.id)}
              accessibilityRole="button"
              accessibilityLabel={`Vote for ${option.label}`}
            >
              <Text style={styles.optionLabel}>{option.label}</Text>
            </PressableScale>
          ))}
        </View>
      )}

      <Text style={styles.footer}>
        {total === 0
          ? 'No votes yet'
          : `${total} vote${total === 1 ? '' : 's'}`}
        {voted ? ' · your pick is locked in' : ''}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    backgroundColor: COLORS.glassPanel,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: RADIUS['2xl'],
    paddingHorizontal: SPACING[3.5],
    paddingVertical: SPACING[3],
    gap: SPACING[2.5],
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  eyebrow: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.primary,
  },
  question: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    lineHeight: 20,
    color: COLORS.textPrimary,
  },
  options: { gap: SPACING[2] },
  option: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2.5],
  },
  optionLabel: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
  },
  results: { gap: SPACING[2] },
  result: { borderRadius: RADIUS.md, overflow: 'hidden' },
  // The bar is the row's background, not a line under it — the label sits on
  // top of the fill, which is what makes a 90% option read as nearly full.
  track: {
    borderRadius: RADIUS.md,
    backgroundColor: inkAlpha(0.05),
    justifyContent: 'center',
  },
  fill: {
    ...({ position: 'absolute', top: 0, bottom: 0, left: 0 } as const),
    backgroundColor: inkAlpha(0.09),
  },
  fillMine: { backgroundColor: COLORS.primaryTint },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2.5],
  },
  resultLabel: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
  },
  resultPct: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  pending: { gap: SPACING[2] },
  pendingRow: {
    height: 42,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.skeletonBone,
  },
  footer: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
  },
}));
