import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { COLORS } from '@/constants/colors';
import { RADIUS, SPACING } from '@/constants/spacing';

// Reusable `.cat-pill` from the locked Mello design language:
// a pill in the category's accent color with the emoji inside a white
// circle on the left, then a bold white label. Emoji-only mode drops the
// label and tightens the padding. Inactive mode renders a muted gray chip.
export function CategoryPill({
  emoji,
  label,
  color = COLORS.primary,
  inactive = false,
  style,
}: {
  emoji: string;
  label?: string;
  color?: string;
  inactive?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = inactive ? '#E2DFE4' : color;
  const fg = inactive ? COLORS.textSecondary : '#fff';
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: bg },
        label ? styles.pillLabeled : styles.pillEmojiOnly,
        style,
      ]}
    >
      <View style={styles.emojiCircle}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      {label ? <Text style={[styles.label, { color: fg }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: RADIUS.full,
  },
  pillLabeled: { paddingVertical: SPACING[1], paddingRight: 13, paddingLeft: 4, gap: SPACING[2] },
  pillEmojiOnly: { padding: SPACING[1] },
  emojiCircle: {
    width: 24,
    height: 24,
    borderRadius: RADIUS.sm,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Glyph metric, not typography — deliberately not a type step.
  emoji: { fontSize: 13, lineHeight: 17 },
  label: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.caption },
});
