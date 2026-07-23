import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { COLORS } from '@/constants/colors';
import { RADIUS, SPACING } from '@/constants/spacing';

// Every accent in `categoryStyle` is a 6-digit hex, so alpha is an 8-digit
// suffix rather than a parse. Anything else falls through to a solid fill, which
// is the safe direction to fail in — a pill that is too loud still reads; one
// with an invalid colour renders black.
function alpha(hex: string, a: number): string | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return (
    hex +
    Math.round(a * 255)
      .toString(16)
      .padStart(2, '0')
  );
}

// The one `.cat-pill` from the locked Mello design language: a glassy chip in
// the category's accent — the accent at 22% with a 40% edge, so it reads as
// tinted glass sitting *in* the surface behind it (a photo, or a frosted sheet)
// rather than a sticker pasted on top. The emoji sits in a translucent disc,
// then a bold white label. Emoji-only mode drops the label and tightens the
// padding.
//
// There used to be a second `solid` tone that painted the accent as an opaque
// fill. It read as a sticker on the glass everywhere it landed, so it's gone —
// this is now the only category pill in the app.
export function CategoryPill({
  emoji,
  label,
  color = COLORS.primary,
  style,
}: {
  emoji: string;
  label?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const fill = alpha(color, 0.22) ?? color;
  const edge = alpha(color, 0.4);
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: fill },
        label ? styles.pillLabeled : styles.pillEmojiOnly,
        edge ? { borderWidth: 1, borderColor: edge } : null,
        style,
      ]}
    >
      <View style={styles.emojiCircle}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
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
  pillLabeled: {
    paddingVertical: SPACING[1],
    paddingRight: 13,
    paddingLeft: 4,
    gap: SPACING[2],
  },
  pillEmojiOnly: { padding: SPACING[1] },
  // Translucent, so a white chip doesn't become the brightest thing on the
  // pill — brighter than the label beside it. Fully round, so the pill reads as
  // one piece of tinted glass.
  emojiCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.fillOnDarkStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Glyph metric, not typography — deliberately not a type step.
  emoji: { fontSize: 13, lineHeight: 17 },
  label: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.caption, color: '#fff' },
});
