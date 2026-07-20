import { StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { COLORS } from '@/constants/colors';
import { Icon, IconName } from './Icon';
import { PressableScale } from './PressableScale';

// The app's one back / close / dismiss affordance: a bare icon, no fill behind
// it. Nav buttons used to sit in a grey circle (IconButton's `plain` variant),
// which read as a control you press rather than a way out — and screens had
// started passing `variant="ghost"` by hand to opt out of it, which is how the
// two treatments drifted apart in the first place.
//
// Use this for anything that leaves the current screen. `IconButton` stays for
// actions that live *on* a screen (save, share, filter) and still want a chip.
export const NAV_ICON_SIZE = 24;

// Nothing is drawn on this footprint, but it is kept at the old circle's size
// on purpose: the glyph lands exactly where the circle's centre used to, so
// removing the fill doesn't shift any header layout, and the tap target stays
// at the 44pt minimum once hitSlop is counted.
export const NAV_BUTTON_SIZE = 40;

export function NavButton({
  icon = 'back',
  onPress,
  color = COLORS.textPrimary,
  accessibilityLabel,
  style,
}: {
  icon?: IconName;
  onPress?: () => void;
  // Pass COLORS.white on dark headers. Nothing else should override this.
  color?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.88}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? 'Go back'}
      style={[styles.base, style]}
    >
      <Icon name={icon} size={NAV_ICON_SIZE} color={color} strokeWidth={2.1} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    width: NAV_BUTTON_SIZE,
    height: NAV_BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
