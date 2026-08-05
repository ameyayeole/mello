import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/colors';
import { SPACING } from '@/constants/spacing';
import { Glass, Icon, PressableScale } from '@/components/ui';
import { themedStyles } from '@/theme';

/**
 * The settings back chip's geometry, in one place.
 *
 * Settings and every screen it opens draw their own chip, and the illusion the
 * whole transition rests on is that they are the *same* chip: the content
 * slides underneath while the button holds still. Two screens agreeing on a
 * position by both happening to write `SPACING[5]` is not an agreement — it is
 * two numbers that are equal today. A one-point difference doesn't read as a
 * one-point difference, it reads as the button twitching every time you open a
 * row.
 *
 * 46/23 is the app's one chip size: profile's `topGlyph`, the home header
 * chips, and the back button notifications lands.
 */
export const CHIP_SIZE = 46;
export const CHIP_RADIUS = 23;
export const CHIP_X = SPACING[5];
export const CHIP_TOP_OFFSET = SPACING[3];

/** Where the content below the chip has to start to clear it. */
export function useChipTop() {
  const insets = useSafeAreaInsets();
  return insets.top + CHIP_TOP_OFFSET;
}

/**
 * The chip at rest: panel glass, back chevron, fixed in window coordinates.
 *
 * Settings itself does *not* use this — its chip is a flying, cross-fading
 * thing that arrives from the profile screen's gear, and it cannot be a static
 * component. It imports the constants above instead, so the two land on the
 * same pixel without sharing a tree.
 */
export function SettingsBackChip({ onPress }: { onPress: () => void }) {
  const top = useChipTop();
  return (
    <View style={[styles.chip, { top, left: CHIP_X }]} pointerEvents="box-none">
      <PressableScale
        scaleTo={0.9}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Glass tier="panel" radius={CHIP_RADIUS} style={styles.pane} />
        <View style={styles.glyph}>
          <Icon
            name="back"
            size={22}
            color={COLORS.textPrimary}
            strokeWidth={2.1}
          />
        </View>
      </PressableScale>
    </View>
  );
}

const styles = themedStyles(() => ({
  chip: { position: 'absolute', zIndex: 2 },
  pane: { width: CHIP_SIZE, height: CHIP_SIZE },
  // The glyph sits over the pane rather than inside it, matching how Settings
  // stacks its two panes and two glyphs — so both screens centre it identically.
  glyph: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
