import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { IconButton } from './IconButton';

// App header: 40px back circle + bold title, white bar.
export function ScreenHeader({
  title,
  onBack,
  backIcon = 'back',
  right,
  transparent = false,
}: {
  title: string;
  onBack?: () => void;
  backIcon?: 'back' | 'close';
  right?: React.ReactNode;
  transparent?: boolean;
}) {
  const router = useRouter();
  return (
    <View style={[styles.header, transparent && styles.transparent]}>
      <IconButton
        icon={backIcon}
        onPress={onBack ?? (() => router.back())}
        accessibilityLabel="Go back"
      />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {right ?? <View style={{ width: 40 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
  },
  transparent: { backgroundColor: 'transparent' },
  title: {
    flex: 1,
    fontFamily: FONTS.heavy,
    fontSize: 20,
    letterSpacing: -0.4,
    color: COLORS.textPrimary,
  },
});
