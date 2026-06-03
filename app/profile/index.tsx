import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { ACTIVITY_MAP } from '@/constants/activities';
import { COLORS } from '@/constants/colors';

export default function MyProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <TouchableOpacity onPress={() => router.push('/profile/settings')}>
          <Text style={styles.settingsBtn}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>
              {user.name[0].toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name}>{user.name}</Text>
          {user.city && <Text style={styles.city}>📍 {user.city}</Text>}
          {user.bio && <Text style={styles.bio}>{user.bio}</Text>}
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{user.events_hosted}</Text>
            <Text style={styles.statLabel}>Events Hosted</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{user.friends_count}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
          {user.age && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{user.age}</Text>
                <Text style={styles.statLabel}>Age</Text>
              </View>
            </>
          )}
        </View>

        {user.interests.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Interests</Text>
            <View style={styles.pills}>
              {user.interests.map((id) => {
                const a = ACTIVITY_MAP[id];
                return (
                  <View key={id} style={styles.pill}>
                    <Text style={styles.pillEmoji}>{a.emoji}</Text>
                    <Text style={styles.pillLabel}>{a.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
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
  },
  back: { fontSize: 22, color: COLORS.textPrimary },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  settingsBtn: { fontSize: 22 },
  scroll: { alignItems: 'center', padding: 24, gap: 20 },
  avatarSection: { alignItems: 'center', gap: 8 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontSize: 36, fontWeight: '800' },
  name: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary },
  city: { fontSize: 15, color: COLORS.textSecondary },
  bio: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    gap: 20,
    width: '100%',
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  statLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: COLORS.border },
  section: { width: '100%' },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillEmoji: { fontSize: 14 },
  pillLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
});
