import { View, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { PressableScale } from '@/components/ui';
import { DOWN_REASONS, DownReason } from '@/utils/wrapRating';
import { themedStyles } from '@/theme';

// Offered after a thumbs-down has ALREADY saved. Never required.
//
// If a thumbs-down cost a mandatory modal while a thumbs-up cost nothing, you
// would have priced honesty — and since the flow is mandatory to unlock the
// wrap, people racing to unlock would thumbs-up everyone to get through. That
// is cleaner-looking data that is less true.
//
// Takes props: it is a leaf, not a step (AGENTS.md's no-props rule is about
// the flow's steps).
export function ReasonChips({
  name,
  onPick,
}: {
  name: string;
  onPick: (reason: DownReason | null) => void;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(240)} style={styles.wrap}>
      <Text style={styles.title}>Anything we should know?</Text>

      <View style={styles.chips}>
        {DOWN_REASONS.map((r) => (
          <PressableScale
            key={r.id}
            scaleTo={0.96}
            style={styles.chip}
            onPress={() => onPick(r.id)}
            accessibilityRole="button"
            accessibilityLabel={`${r.label}, about ${name}`}
          >
            <Text style={styles.chipText}>{r.label}</Text>
          </PressableScale>
        ))}
        <PressableScale
          scaleTo={0.96}
          style={[styles.chip, styles.skipChip]}
          onPress={() => onPick(null)}
          accessibilityRole="button"
          accessibilityLabel="Skip, say nothing"
        >
          <Text style={[styles.chipText, styles.skipText]}>Skip</Text>
        </PressableScale>
      </View>

      <Text style={styles.footnote}>Your thumbs-down is already saved.</Text>
    </Animated.View>
  );
}

const styles = themedStyles(() => ({
  wrap: {
    paddingHorizontal: SPACING[4],
    paddingBottom: SPACING[3],
    gap: SPACING[2.5],
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING[2],
  },
  chip: {
    paddingHorizontal: SPACING[3.5],
    height: 36,
    justifyContent: 'center',
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
  },
  skipChip: { backgroundColor: 'transparent', borderColor: 'transparent' },
  skipText: { color: COLORS.textMuted },
  footnote: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
}));
