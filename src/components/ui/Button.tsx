import {
  View,
  Text,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { COLORS } from '@/constants/colors';
import { SPACING } from '@/constants/spacing';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { PressableScale } from './PressableScale';
import { Icon, IconName } from './Icon';
import { themedStyles } from '@/theme';

// The app has exactly three buttons. Pick by how much weight the action
// deserves, not by colour:
//
//   primary   — coral on white text. The standout. Major CTAs ONLY: sign in,
//               host an event, pay, check in, save. Aim for one per screen.
//   secondary — the workhorse; use this by default. Black with white text on
//                the light theme, white glass with ink text on the dark one:
//                whichever way it goes, it is the thing on the screen that
//                lifts furthest off its surface.
//   tertiary  — white on black text. Low-stakes actions: back, dismiss, done.
//
// `secondary` is the default precisely so coral stays rare. Reaching for
// `variant="primary"` should feel like a decision.
//
// All three are rounded rectangles. There are deliberately no pill buttons.
type Variant = 'primary' | 'secondary' | 'tertiary';

// Valence, deliberately NOT a fourth variant. `variant` answers "how much
// weight does this action deserve"; `tone` answers "does it destroy something".
// They are independent questions — a destructive action can be the screen's CTA
// or a quiet row action — so folding them into one axis would have meant either
// breaking the three-variant rule or leaving red unavailable.
//
// It was unavailable, and it cost: BlockConfirmDialog, DiscardDialog and the
// community delete confirm each hand-rolled a red PressableScale rather than
// use Button, which is the fork this prop exists to stop.
type Tone = 'default' | 'destructive';

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

// A function, not a `Record`: an object built here would read the palette once,
// at import, and freeze to whichever theme booted first.
function labelColorFor(variant: Variant): string {
  // Coral is coral on both themes, and white reads on it either way.
  if (variant === 'primary') return COLORS.white;
  // `secondary` flips: near-black with a white label on the light theme, white
  // glass with an ink label on the dark one. The pair moves together — see the
  // tokens in constants/colors.
  if (variant === 'secondary') return COLORS.onButtonSecondary;
  return COLORS.textPrimary;
}

export function Button({
  label,
  onPress,
  variant = 'secondary',
  tone = 'default',
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
  tone?: Tone;
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
  const destructive = tone === 'destructive';
  // A filled destructive button carries the red; an outline one (tertiary)
  // keeps its white fill and turns only the label, because a solid red
  // low-stakes button would out-shout the screen's actual CTA.
  const labelColor = disabled
    ? COLORS.textMuted
    : destructive && variant === 'tertiary'
      ? COLORS.error
      : labelColorFor(variant);

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
        // After styles[variant] so it overrides the fill, before `disabled` so
        // a disabled destructive button still greys out.
        destructive && variant !== 'tertiary' && styles.destructive,
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

const styles = themedStyles(() => ({
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
  secondary: { backgroundColor: COLORS.buttonSecondary },
  tertiary: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Also clears `primary`'s coral glow — a red button haloed in coral reads as
  // two colours arguing rather than as one warning.
  destructive: {
    backgroundColor: COLORS.error,
    shadowColor: COLORS.error,
  },

  disabled: {
    backgroundColor: COLORS.disabled,
    borderColor: COLORS.disabled,
    shadowOpacity: 0,
    elevation: 0,
  },
}));
