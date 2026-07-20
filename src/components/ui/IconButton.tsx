import { StyleSheet, StyleProp, ViewStyle, View } from 'react-native';
import { COLORS } from '@/constants/colors';
import { Icon, IconName } from './Icon';
import { PressableScale } from './PressableScale';

// 40×40 circular icon button for actions that live *on* a screen — share,
// filter, rotate, overflow menus. 'plain' = grey fill, 'surface' = white +
// border, 'tint' = coral tint fill with coral icon, 'ghost' = no fill.
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
  style,
  accessibilityLabel,
}: {
  icon: IconName;
  onPress?: () => void;
  variant?: 'plain' | 'surface' | 'tint' | 'ghost';
  size?: number;
  iconSize?: number;
  color?: string;
  badge?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const iconColor =
    color ?? (variant === 'tint' ? COLORS.primary : COLORS.textPrimary);
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? icon}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        variant === 'plain' && styles.plain,
        variant === 'surface' && styles.surface,
        variant === 'tint' && styles.tint,
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
