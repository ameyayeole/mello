import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Icon, IconName } from './Icon';
import { Button } from './Button';

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
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
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

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 8 },
  compact: { paddingTop: 28 },
  badge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emoji: { fontSize: 34 },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  action: { marginTop: 8 },
});
