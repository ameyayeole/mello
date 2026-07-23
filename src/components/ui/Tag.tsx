import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { COLORS } from '@/constants/colors';
import { RADIUS, SPACING } from '@/constants/spacing';
import { alpha } from '@/utils/color';
import { Icon, IconName } from './Icon';

// A small static status tag: "Host", "Female-only", "Full". Says what something
// *is* — it is never a control. For anything tappable use `Button`, and for a
// selectable filter chip use the screen's own chip (those are a different thing
// with a different state model).
//
// ── Why this is not `CategoryPill` ───────────────────────────────────────────
// Same tinted-glass idea, different surface. CategoryPill lives on photos, so
// its label is white on a 22% wash — over a white card that combination is
// unreadable. This one lives on cards, so the accent itself carries the text and
// the wash sits lower. Two surfaces, two treatments; forking one to serve both
// would have meant a `tone` prop that changes every value in the component.
//
// ── Why no `Glass` / BlurView ────────────────────────────────────────────────
// "Frosted" here is the *look*, not a backdrop filter. These tags sit on opaque
// white cards, where a real blur samples a flat colour and computes nothing — it
// would cost a blur layer per tag to render exactly the fill below. The
// translucent accent plus the brighter edge is what reads as glass; the edge is
// doing most of that work, which is why it is a stronger alpha than the fill.
const FILL_ALPHA = 0.12;
const EDGE_ALPHA = 0.28;

export function Tag({
  label,
  color = COLORS.primary,
  icon,
  style,
}: {
  label: string;
  // Any 6-digit hex from `COLORS` or `categoryStyle`. A colour `alpha()` can't
  // parse falls back to an opaque fill with white text, which is loud but legible
  // — the safe direction to fail in.
  color?: string;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const fill = alpha(color, FILL_ALPHA);
  const edge = alpha(color, EDGE_ALPHA);
  const tinted = fill != null && edge != null;

  return (
    <View
      style={[
        styles.tag,
        tinted
          ? { backgroundColor: fill, borderColor: edge }
          : { backgroundColor: color, borderColor: color },
        style,
      ]}
    >
      {icon && (
        <Icon
          name={icon}
          size={11}
          color={tinted ? color : COLORS.white}
          strokeWidth={2.2}
        />
      )}
      <Text style={[styles.label, { color: tinted ? color : COLORS.white }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING[1],
    paddingHorizontal: SPACING[2],
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  label: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.nano,
    letterSpacing: 0.3,
  },
});
