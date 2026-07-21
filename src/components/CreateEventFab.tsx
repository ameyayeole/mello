import { StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { useUIStore } from '@/stores/uiStore';
import { Icon, PressableScale, useTabBarInset } from '@/components/ui';

// Starts the in-map creation flow (no standalone create screen anymore — the
// map itself is the form). Screens other than the map hop to the map tab with
// the flow already armed.
export default function CreateEventFab({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  const setCreatingEvent = useUIStore((s) => s.setCreatingEvent);
  // Every call site is a tab screen, and the tab bar now floats over the
  // content — without this the FAB sits underneath the glass.
  const tabBarInset = useTabBarInset();
  return (
    <PressableScale
      style={[styles.fab, { bottom: tabBarInset + SPACING[3] }]}
      scaleTo={0.88}
      onPress={
        onPress ??
        (() => {
          setCreatingEvent(true);
          router.push('/(tabs)/map');
        })
      }
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
    width: 56,
    height: 56,
    borderRadius: RADIUS.xl,
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
