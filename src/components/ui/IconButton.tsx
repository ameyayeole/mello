import { StyleSheet, StyleProp, ViewStyle, View } from 'react-native';
import { COLORS } from '@/constants/colors';
import { Icon, IconName } from './Icon';
import { PressableScale } from './PressableScale';

// 40×40 circular icon button for actions that live *on* a screen — share,
// filter, rotate, overflow menus. 'plain' = grey fill, 'surface' = white +
// border, 'tint' = coral tint fill with coral icon, 'ghost' = no fill,
// 'onPhoto' = smoked-glass chip with a white glyph, for a button sitting on
// top of an image — the same treatment `Glass`'s `onPhoto` tier gives a pane.
//
// Not for navigation: back / close / dismiss all use `NavButton`, which is a
// bare glyph with no chip behind it.
export function IconButton({
  icon,
  onPress,
  variant = 'plain',
  size = 40,
  iconSize = 20,
  color,
  badge = false,
  disabled = false,
  style,
  accessibilityLabel,
}: {
  icon: IconName;
  onPress?: () => void;
  variant?: 'plain' | 'surface' | 'tint' | 'ghost' | 'onPhoto';
  size?: number;
  iconSize?: number;
  color?: string;
  badge?: boolean;
  // Greys the glyph and blocks the press. Without it a caller that needs a
  // disabled state has to wrap the button in something that swallows taps,
  // which leaves it looking live — the bug this screen's text Save button had.
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const iconColor = disabled
    ? COLORS.textMuted
    : (color ??
      (variant === 'tint'
        ? COLORS.primary
        : variant === 'onPhoto'
          ? COLORS.white
          : COLORS.textPrimary));
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={disabled ? 1 : 0.9}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel ?? icon}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        variant === 'plain' && styles.plain,
        variant === 'surface' && styles.surface,
        variant === 'tint' && styles.tint,
        variant === 'onPhoto' && styles.onPhoto,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Icon name={icon} size={iconSize} color={iconColor} />
      {badge && <View style={styles.badge} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  plain: { backgroundColor: COLORS.background },
  surface: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tint: { backgroundColor: COLORS.primaryTint },
  // Neutral fill, not a tinted one — a disabled coral chip still reads as the
  // screen's live CTA from across the room.
  disabled: { backgroundColor: COLORS.inkFaint, borderColor: COLORS.inkSubtle },
  onPhoto: {
    backgroundColor: COLORS.glassOnPhoto,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: COLORS.glassBorderOnPhoto,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 8,
    height: 8,
    // Notification dot; geometry, not a corner radius.
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    borderWidth: 1.5,
    borderColor: COLORS.surface,
  },
});
