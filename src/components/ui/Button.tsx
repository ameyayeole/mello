import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { COLORS } from '@/constants/colors';
import { SPACING } from '@/constants/spacing';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { PressableScale } from './PressableScale';
import { Icon, IconName } from './Icon';

// The app has exactly three buttons. Pick by how much weight the action
// deserves, not by colour:
//
//   primary   — coral on white text. The standout. Major CTAs ONLY: sign in,
//               host an event, pay, check in, save. Aim for one per screen.
//   secondary — black on white text. The workhorse; use this by default.
//   tertiary  — white on black text. Low-stakes actions: back, dismiss, done.
//
// `secondary` is the default precisely so coral stays rare. Reaching for
// `variant="primary"` should feel like a decision.
//
// All three are rounded rectangles. There are deliberately no pill buttons.
type Variant = 'primary' | 'secondary' | 'tertiary';

// Small buttons use the body font (Plus Jakarta) and larger ones the display
// font (Bricolage) — matching the distinction the screens already drew by hand.
const SIZES = {
  sm: {
    height: 34,
    radius: 10,
    font: TYPE_SIZE.caption,
    padding: SPACING[3.5],
    icon: 14,
    family: FONTS.bold,
  },
  md: {
    height: 44,
    radius: 12,
    font: TYPE_SIZE.body,
    padding: SPACING[4],
    icon: 16,
    family: FONTS.heading,
  },
  lg: {
    height: 48,
    radius: 14,
    font: TYPE_SIZE.bodyLg,
    padding: SPACING[6],
    icon: 18,
    family: FONTS.heading,
  },
} as const;

const LABEL_COLOR: Record<Variant, string> = {
  primary: COLORS.white,
  secondary: COLORS.white,
  tertiary: COLORS.textPrimary,
};

export function Button({
  label,
  onPress,
  variant = 'secondary',
  size = 'lg',
  icon,
  iconPosition = 'leading',
  disabled = false,
  loading = false,
  fullWidth = false,
  height,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconPosition?: 'leading' | 'trailing';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  // Explicit height override. Prefer `size`.
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const spec = SIZES[size];
  const resolvedHeight = height ?? spec.height;
  // Raw-height callers keep the large treatment they were written against.
  const radius = height != null ? 14 : spec.radius;
  const padding = height != null ? 24 : spec.padding;
  const fontSize = height != null ? TYPE_SIZE.bodyLg : spec.font;
  const fontFamily = height != null ? FONTS.heading : spec.family;
  const labelColor = disabled ? COLORS.textMuted : LABEL_COLOR[variant];

  const glyph = icon ? (
    <Icon name={icon} size={spec.icon} color={labelColor} />
  ) : null;

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.base,
        {
          height: resolvedHeight,
          borderRadius: radius,
          paddingHorizontal: padding,
        },
        fullWidth && styles.fullWidth,
        styles[variant],
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} size="small" />
      ) : (
        <View style={styles.content}>
          {iconPosition === 'leading' && glyph}
          <Text style={[{ fontFamily, fontSize, color: labelColor }]}>
            {label}
          </Text>
          {iconPosition === 'trailing' && glyph}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },

  primary: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  secondary: { backgroundColor: COLORS.accent },
  tertiary: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  disabled: {
    backgroundColor: COLORS.disabled,
    borderColor: COLORS.disabled,
    shadowOpacity: 0,
    elevation: 0,
  },
});
