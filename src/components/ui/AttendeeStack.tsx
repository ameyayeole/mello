import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { FONTS } from '@/constants/typography';
import { COLORS } from '@/constants/colors';

const PASTELS = ['#FFCAB8', '#C9B6FF', '#A8D0FF', '#FFD0A8'];

// Overlapping attendee bubbles from the design language. When nobody has joined
// yet (count === 0) it renders a subtle "be the first" prompt instead of an
// empty gap — brand-new events shouldn't look broken.
export function AttendeeStack({
  count,
  max = 3,
  size = 27,
  ring = true,
  ringColor = COLORS.surface,
  emptyLabel = 'Be the first to join',
  style,
}: {
  count: number;
  max?: number;
  size?: number;
  ring?: boolean;
  ringColor?: string;
  emptyLabel?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  if (count <= 0) {
    return emptyLabel ? <Text style={styles.empty}>{emptyLabel}</Text> : null;
  }

  const shown = Math.min(count, max);
  const overflow = count - shown;
  const radius = size / 2;
  const border = ring ? { borderWidth: 2, borderColor: ringColor } : null;

  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: shown }).map((_, i) => (
        <View
          key={i}
          style={[
            {
              width: size,
              height: size,
              borderRadius: radius,
              backgroundColor: PASTELS[i % PASTELS.length],
              marginLeft: i === 0 ? 0 : -9,
            },
            border,
          ]}
        />
      ))}
      {overflow > 0 && (
        <View
          style={[
            styles.overflow,
            { width: size, height: size, borderRadius: radius },
            !ring && { marginLeft: -9, borderWidth: 0 },
            ring && { borderColor: ringColor },
          ]}
        >
          <Text style={styles.overflowText}>+{overflow}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  overflow: {
    marginLeft: -9,
    borderWidth: 2,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowText: { fontFamily: FONTS.heavy, fontSize: 9.5, color: '#fff' },
  empty: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    color: COLORS.textMuted,
  },
});
