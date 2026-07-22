import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { COLORS } from '@/constants/colors';
import { RADIUS, SPACING } from '@/constants/spacing';

// Every accent in `categoryStyle` is a 6-digit hex, so alpha is an 8-digit
// suffix rather than a parse. Anything else falls through to the solid
// treatment, which is the safe direction to fail in — a pill that is too loud
// still reads; one with an invalid colour renders black.
function alpha(hex: string, a: number): string | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return (
    hex +
    Math.round(a * 255)
      .toString(16)
      .padStart(2, '0')
  );
}

// Reusable `.cat-pill` from the locked Mello design language:
// a pill in the category's accent color with the emoji inside a white
// circle on the left, then a bold white label. Emoji-only mode drops the
// label and tightens the padding. Inactive mode renders a muted gray chip.
//
// `tone` picks how the accent is carried:
//
//   solid        the accent as a fill. The default, and what every pill on a
//                white surface uses.
//   translucent  the accent at 22% with a 40% edge, over whatever is behind.
//                For pills on a dark frosted surface, where a solid accent
//                reads as a sticker pasted on the glass rather than part of it.
export function CategoryPill({
  emoji,
  label,
  color = COLORS.primary,
  inactive = false,
  tone = 'solid',
  style,
}: {
  emoji: string;
  label?: string;
  color?: string;
  inactive?: boolean;
  tone?: 'solid' | 'translucent';
  style?: StyleProp<ViewStyle>;
}) {
  const fill = tone === 'translucent' ? alpha(color, 0.22) : null;
  const edge = tone === 'translucent' ? alpha(color, 0.4) : null;
  const bg = inactive ? '#E2DFE4' : (fill ?? color);
  const fg = inactive ? COLORS.textSecondary : '#fff';
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: bg },
        label ? styles.pillLabeled : styles.pillEmojiOnly,
        edge && { borderWidth: 1, borderColor: edge },
        style,
      ]}
    >
      <View style={[styles.emojiCircle, !!fill && styles.emojiCircleOnDark]}>
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
  // A white chip inside a translucent pill would be the brightest thing on the
  // sheet — brighter than the label it sits next to. It goes translucent too,
  // and fully round, so the pill reads as one piece of tinted glass.
  emojiCircleOnDark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.fillOnDarkStrong,
  },
  // Glyph metric, not typography — deliberately not a type step.
  emoji: { fontSize: 13, lineHeight: 17 },
  label: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.caption },
});
