import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useLocation } from '@/hooks/useLocation';
import { COLORS } from '@/constants/colors';

const PERMS = [
  {
    icon: '📍',
    title: 'Location',
    desc: 'Show events near you and let others find you on the map.',
  },
  {
    icon: '🔔',
    title: 'Notifications',
    desc: 'Get notified when someone joins your event or sends you a message.',
  },
  {
    icon: '📷',
    title: 'Camera & Photos',
    desc: 'Upload a profile photo so people recognise you at events.',
  },
];

export default function PermissionsScreen() {
  const router = useRouter();
  const { requestAndStart } = useLocation();

  async function handleAllow() {
    await requestAndStart();
    router.push('/onboarding/interests');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>A few permissions needed</Text>
        <Text style={styles.subtitle}>
          MELLO works best with access to the following:
        </Text>

        <View style={styles.list}>
          {PERMS.map((p) => (
            <View key={p.title} style={styles.item}>
              <Text style={styles.icon}>{p.icon}</Text>
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>{p.title}</Text>
                <Text style={styles.itemDesc}>{p.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleAllow}>
            <Text style={styles.primaryBtnText}>Allow & Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/onboarding/interests')}>
            <Text style={styles.skipLink}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, lineHeight: 24 },
  list: { gap: 20 },
  item: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  icon: { fontSize: 28, width: 40, textAlign: 'center' },
  itemText: { flex: 1 },
  itemTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  itemDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginTop: 2,
  },
  actions: { gap: 12 },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  skipLink: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 15,
  },
});
