import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSavedEventIds } from '@/hooks/useSwipeDeck';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Icon, PressableScale } from '@/components/ui';

// Circular "open the wishlist" button. The bookmark fills in and a count badge
// appears as soon as anything is saved. `raised` matches the floating action
// buttons on the swipe screen; without it, it blends into headers like an
// IconButton.
export default function WishlistButton({
  size = 42,
  iconSize = 20,
  raised = false,
  color,
  style,
}: {
  size?: number;
  iconSize?: number;
  raised?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const { data } = useSavedEventIds();
  const count = data?.length ?? 0;

  return (
    <PressableScale
      scaleTo={0.88}
      onPress={() => router.push('/events/wishlist')}
      accessibilityRole="button"
      accessibilityLabel={
        count > 0 ? `Open wishlist, ${count} saved` : 'Open wishlist'
      }
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        raised ? styles.raised : styles.plain,
        style,
      ]}
    >
      <Icon
        name={count > 0 ? 'bookmarkFilled' : 'bookmark'}
        size={iconSize}
        color={count > 0 ? COLORS.primary : color ?? COLORS.textPrimary}
        strokeWidth={2}
      />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  plain: { backgroundColor: COLORS.background },
  raised: {
    backgroundColor: COLORS.surface,
    shadowColor: '#0F182C',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: FONTS.heavy, fontSize: 10, color: '#fff' },
});
