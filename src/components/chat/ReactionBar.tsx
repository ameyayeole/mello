import { View, Text, StyleSheet } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { Glass, Icon, PressableScale } from '@/components/ui';

// The iMessage tapback bar: a floating row of emoji that appears over a
// long-pressed bubble.
//
// Four, not six. More turns a one-glance choice into a menu, and every one
// added is a smaller tap target on a phone.
export const TAPBACKS = ['❤️', '👍', '👎', '😂'] as const;

// Bigger than the glyph metric would suggest: this is the tap target, and an
// emoji's own box sits well inside its font size.
const EMOJI_SIZE = 24;

export default function ReactionBar({
  mine,
  alignRight,
  onPick,
  onMore,
}: {
  // The emoji this person already has on the message, if any — it reads as
  // selected so a second tap obviously takes it back.
  mine?: string;
  // Hugs the same edge as the bubble it belongs to.
  alignRight?: boolean;
  onPick: (emoji: string) => void;
  // Copy / pin / report / delete still live in the long-press sheet. The bar
  // took over the long press, so it has to carry the way back to them.
  onMore?: () => void;
}) {
  return (
    <Animated.View
      entering={ZoomIn.duration(180)}
      style={alignRight ? styles.wrapRight : styles.wrap}
    >
      <Glass tier="chrome" radius={RADIUS.full} style={styles.bar}>
        {TAPBACKS.map((emoji) => (
          <PressableScale
            key={emoji}
            scaleTo={0.82}
            onPress={() => onPick(emoji)}
            accessibilityRole="button"
            accessibilityLabel={`React ${emoji}`}
            accessibilityState={{ selected: mine === emoji }}
          >
            <View style={[styles.slot, mine === emoji && styles.slotMine]}>
              <Text style={styles.emoji}>{emoji}</Text>
            </View>
          </PressableScale>
        ))}
        {onMore ? (
          <PressableScale
            scaleTo={0.82}
            onPress={onMore}
            accessibilityRole="button"
            accessibilityLabel="More message actions"
          >
            <View style={styles.slot}>
              <Icon name="dots" size={18} color={COLORS.textSecondary} />
            </View>
          </PressableScale>
        ) : null}
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', marginBottom: SPACING[1] },
  wrapRight: { alignSelf: 'flex-end', marginBottom: SPACING[1] },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[0.5],
    paddingHorizontal: SPACING[1.5],
    paddingVertical: SPACING[1],
  },
  slot: {
    width: 40,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotMine: { backgroundColor: COLORS.inkSubtle },
  emoji: { fontSize: EMOJI_SIZE, lineHeight: EMOJI_SIZE + 4 },
});
