import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { signOut } from '@/services/auth.service';
import { updateProfile } from '@/services/auth.service';
import { COLORS } from '@/constants/colors';

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const { ghostMode, setGhostMode } = useUIStore();

  async function toggleGhostMode(value: boolean) {
    setGhostMode(value);
    if (user) {
      await updateProfile(user.id, { is_ghost_mode: value });
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          clear();
          router.replace('/onboarding/welcome');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Privacy</Text>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Ghost Mode</Text>
            <Text style={styles.rowSub}>
              Hide your online presence from other users
            </Text>
          </View>
          <Switch
            value={ghostMode}
            onValueChange={toggleGhostMode}
            trackColor={{ true: COLORS.primary, false: COLORS.border }}
            thumbColor={COLORS.surface}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Account</Text>

        <TouchableOpacity
          style={styles.row}
          onPress={() => router.push('/profile')}
        >
          <Text style={styles.rowTitle}>Edit Profile</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  back: { fontSize: 22, color: COLORS.textPrimary },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  section: { marginTop: 24 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingHorizontal: 20,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, color: COLORS.textPrimary },
  rowSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  chevron: { fontSize: 20, color: COLORS.textMuted },
  footer: { position: 'absolute', bottom: 40, left: 0, right: 0, padding: 20 },
  signOutBtn: {
    backgroundColor: '#FFF0EF',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  signOutText: { color: COLORS.primary, fontWeight: '700', fontSize: 16 },
});
