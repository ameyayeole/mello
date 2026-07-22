import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';

// "+7" — the people a stack didn't draw, or the whole count where no faces are
// shown at all. Coral disc, white text, everywhere in the app.
//
// One component because it was three: AttendeeStack drew its own, the Inbox
// rail drew another, and the two had already drifted to different fills and
// different rules about the plus sign. Anything that needs to say "and this
// many more" uses this.
//
// **It is a circle, always.** The size is applied to both axes and the radius
// is half of it, so a two-digit count tightens the type rather than stretching
// the disc into a pill — which is what a `minWidth` did the first time.

// Type steps are a scale for prose; this is a number inside a disc whose
// diameter the caller chose, so it is sized off the disc. Above two digits the
// count gets tighter rather than the disc getting wider.
function textSize(size: number, digits: number): number {
  const base = Math.round(size * 0.42);
  return digits > 2 ? Math.round(base * 0.8) : base;
}

export function OverflowCount({
  count,
  size = 27,
  // The ring that separates it from whatever it overlaps — a face beside it,
  // or the photo underneath.
  ringColor,
  ringWidth = 1.5,
  style,
}: {
  count: number;
  size?: number;
  ringColor?: string;
  ringWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  if (count <= 0) return null;
  const label = `+${count}`;

  return (
    <View
      style={[
        styles.disc,
        { width: size, height: size, borderRadius: size / 2 },
        ringColor ? { borderWidth: ringWidth, borderColor: ringColor } : null,
        style,
      ]}
    >
      <Text
        style={[styles.text, { fontSize: textSize(size, `${count}`.length) }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: {
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // A long count is clipped by the circle rather than allowed to widen it.
    overflow: 'hidden',
  },
  text: { fontFamily: FONTS.heavy, color: COLORS.white },
});
