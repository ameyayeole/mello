import { View,
  Text,
  StyleProp,
  ViewStyle } from 'react-native';
import { COLORS } from '@/constants/colors';
import { SPACING } from '@/constants/spacing';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon, IconName } from './Icon';
import { Button } from './Button';
import { themedStyles } from '@/theme';

// The "nothing here yet" block: tinted circle, title, supporting line and an
// optional call to action. Used directly or as a FlatList ListEmptyComponent.
export function EmptyState({
  icon,
  emoji,
  title,
  body,
  actionLabel,
  onAction,
  compact = false,
  onDark = false,
  style,
}: {
  icon?: IconName;
  // Alternative to `icon` for the screens that lead with an emoji.
  emoji?: string;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  // Tighter top padding, for use inside a card or short list.
  compact?: boolean;
  /**
   * Sitting on the `onPhoto` sheet, which is dark in *both* themes — so this is
   * not "the dark theme", it is "this surface". The ink ramp never appears
   * there. Add the prop; do not fork the component.
   */
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wrap, compact && styles.compact, style]}>
      {(icon || emoji) && (
        <View style={styles.badge}>
          {emoji ? (
            <Text style={styles.emoji}>{emoji}</Text>
          ) : (
            <Icon name={icon!} size={30} color={COLORS.primary} />
          )}
        </View>
      )}
      <Text style={[styles.title, onDark && styles.titleOnDark]}>{title}</Text>
      {body ? (
        <Text style={[styles.body, onDark && styles.bodyOnDark]}>{body}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          size="md"
          onPress={onAction}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: SPACING[8], gap: SPACING[2] },
  compact: { paddingTop: SPACING[7] },
  titleOnDark: { color: COLORS.white },
  bodyOnDark: { color: COLORS.textOnDark },
  badge: {
    width: 84,
    height: 84,
    // Half of the 84px tile — a circle, not a scale step.
    borderRadius: 42,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[2],
  },
  // Glyph metric, not typography — deliberately not a type step.
  emoji: { fontSize: 34 },
  title: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  action: { marginTop: SPACING[2] },
}));
