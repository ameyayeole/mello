import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { Icon, PressableScale } from '@/components/ui';

export default function CreateEventFab() {
  const router = useRouter();
  return (
    <PressableScale
      style={styles.fab}
      scaleTo={0.88}
      onPress={() => router.push('/events/create')}
      accessibilityLabel="Create event"
      accessibilityRole="button"
    >
      <Icon name="plus" size={28} color="#fff" strokeWidth={2.2} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
});
