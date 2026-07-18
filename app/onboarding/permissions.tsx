import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLocation } from '@/hooks/useLocation';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, Icon, IconName } from '@/components/ui';

const PERMS: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: 'location',
    title: 'Location',
    desc: 'Show events happening near you',
  },
  {
    icon: 'bell',
    title: 'Notifications',
    desc: 'RSVP updates, messages & reminders',
  },
  {
    icon: 'camera',
    title: 'Camera & Photos',
    desc: 'Upload a photo so people recognise you',
  },
];

export default function PermissionsScreen() {
  const router = useRouter();
  const { requestAndStart } = useLocation();

  async function handleAllow() {
    await requestAndStart();
    router.push('/auth/login');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View entering={FadeInDown.duration(400)}>
          <Text style={styles.title}>A few quick permissions</Text>
          <Text style={styles.subtitle}>
            Mello only uses these while you're using the app.
          </Text>
        </Animated.View>

        <View style={styles.list}>
          {PERMS.map((p, i) => (
            <Animated.View
              key={p.title}
              entering={FadeInDown.delay(100 + i * 80).duration(400)}
              style={styles.card}
            >
              <View style={styles.cardIcon}>
                <Icon name={p.icon} size={23} color={COLORS.primary} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{p.title}</Text>
                <Text style={styles.cardDesc}>{p.desc}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        <Animated.View
          entering={FadeInDown.delay(380).duration(400)}
          style={styles.safetyNote}
        >
          <Icon name="shield" size={18} color={COLORS.success} />
          <Text style={styles.safetyText}>
            Your exact location is never shown to others, only your
            approximate area.
          </Text>
        </Animated.View>

        <View style={styles.actions}>
          <Button label="Allow & continue" onPress={handleAllow} />
          <TouchableOpacity
            onPress={() => router.push('/auth/login')}
            hitSlop={10}
          >
            <Text style={styles.skipLink}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 26,
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 24,
    letterSpacing: -0.48,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  list: { gap: 13, marginTop: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 18,
    shadowColor: '#0F182C',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  cardDesc: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    lineHeight: 16,
    color: 'rgba(15,24,44,0.5)',
    marginTop: 2,
  },
  safetyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 18,
    padding: 13,
    backgroundColor: 'rgba(31,164,99,0.09)',
    borderRadius: 12,
  },
  safetyText: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(15,24,44,0.65)',
  },
  actions: { marginTop: 'auto', gap: 14 },
  skipLink: {
    textAlign: 'center',
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: 'rgba(15,24,44,0.5)',
  },
});
