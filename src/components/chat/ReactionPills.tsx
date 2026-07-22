import { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { MessageReaction } from '@/types/models';
import { PressableScale } from '@/components/ui';

// What a message's reactions look like once they exist: one pill per distinct
// emoji, carrying a count when more than one person picked it, tucked against
// the bottom edge of the bubble the way iMessage does it.

const EMOJI_SIZE = 13;

export default function ReactionPills({
  reactions,
  myUserId,
  isMine,
  onPress,
}: {
  reactions: MessageReaction[];
  myUserId?: string;
  // Which side of the thread the bubble is on — the pills hug its outer edge.
  isMine: boolean;
  onPress?: () => void;
}) {
  // Grouped in first-reacted order, so a pill doesn't jump position when
  // someone else joins it.
  const groups = useMemo(() => {
    const order: string[] = [];
    const counts = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions) {
      const entry = counts.get(r.emoji);
      if (entry) {
        entry.count += 1;
        entry.mine = entry.mine || r.user_id === myUserId;
      } else {
        order.push(r.emoji);
        counts.set(r.emoji, { count: 1, mine: r.user_id === myUserId });
      }
    }
    return order.map((emoji) => ({ emoji, ...counts.get(emoji)! }));
  }, [reactions, myUserId]);

  if (groups.length === 0) return null;

  return (
    <PressableScale
      scaleTo={0.94}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Reactions"
      style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}
    >
      {groups.map(({ emoji, count, mine }) => (
        <Animated.View
          key={emoji}
          entering={ZoomIn.duration(180)}
          exiting={ZoomOut.duration(140)}
          style={[styles.pill, mine && styles.pillMine]}
        >
          <Text style={styles.emoji}>{emoji}</Text>
          {count > 1 ? <Text style={styles.count}>{count}</Text> : null}
        </Animated.View>
      ))}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: SPACING[1],
    // Rides up over the bubble's bottom edge rather than sitting under it, so
    // it reads as attached to the message and not as a message of its own.
    marginTop: -SPACING[1.5],
    marginBottom: SPACING[0.5],
  },
  rowMine: { alignSelf: 'flex-end', marginRight: SPACING[2] },
  rowTheirs: { alignSelf: 'flex-start', marginLeft: SPACING[2] },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[0.5],
    paddingHorizontal: SPACING[1.5],
    paddingVertical: SPACING[0.5],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.inkSubtle,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pillMine: { borderColor: COLORS.primary },
  emoji: { fontSize: EMOJI_SIZE, lineHeight: EMOJI_SIZE + 4 },
  count: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.nano,
    color: COLORS.textSecondary,
  },
});
