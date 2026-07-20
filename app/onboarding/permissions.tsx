import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLocation } from '@/hooks/useLocation';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, Icon, IconName, Screen } from '@/components/ui';

type PermKey = 'location' | 'notifications' | 'camera';

const PERMS: {
  key: PermKey;
  icon: IconName;
  title: string;
  desc: string;
  accent: string;
  tint: string;
}[] = [
  {
    key: 'location',
    icon: 'location',
    title: 'Location',
    desc: 'Find events near you',
    accent: COLORS.primary,
    tint: COLORS.primaryTint,
  },
  {
    key: 'notifications',
    icon: 'bell',
    title: 'Notifications',
    desc: 'Chats, invites & reminders',
    accent: COLORS.secondary,
    tint: COLORS.secondaryTint,
  },
  {
    key: 'camera',
    icon: 'camera',
    title: 'Camera',
    desc: 'Check in & share photos',
    accent: COLORS.success,
    tint: COLORS.successTint,
  },
];

function Toggle({ on }: { on: boolean }) {
  return (
    <View
      style={[
        styles.toggle,
        { backgroundColor: on ? COLORS.primary : COLORS.disabled, alignItems: on ? 'flex-end' : 'flex-start' },
      ]}
    >
      <View style={styles.knob} />
    </View>
  );
}

export default function PermissionsScreen() {
  const router = useRouter();
  const { requestAndStart } = useLocation();
  const [enabled, setEnabled] = useState<Record<PermKey, boolean>>({
    location: true,
    notifications: true,
    camera: false,
  });

  function toggle(key: PermKey) {
    setEnabled((s) => ({ ...s, [key]: !s[key] }));
  }

  async function handleContinue() {
    if (enabled.location) await requestAndStart();
    router.push('/onboarding/guidelines');
  }

  return (
    <Screen>
      <View style={styles.content}>
        <Animated.View entering={FadeInDown.duration(400)}>
          <Text style={styles.title}>A couple of{'\n'}quick things</Text>
          <Text style={styles.subtitle}>
            So Mello can show you what's happening around you.
          </Text>
        </Animated.View>

        <View style={styles.list}>
          {PERMS.map((p, i) => (
            <Animated.View
              key={p.key}
              entering={FadeInDown.delay(100 + i * 80).duration(400)}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => toggle(p.key)}
                style={styles.card}
              >
                <View style={[styles.cardIcon, { backgroundColor: p.tint }]}>
                  <Icon name={p.icon} size={23} color={p.accent} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{p.title}</Text>
                  <Text style={styles.cardDesc}>{p.desc}</Text>
                </View>
                <Toggle on={enabled[p.key]} />
              </TouchableOpacity>
            </Animated.View>
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <Button label="Continue" onPress={handleContinue} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 30,
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -0.8,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textSecondary,
    marginTop: 12,
  },
  list: { gap: 14, marginTop: 26 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: 18,
    padding: 18,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: {
    fontFamily: FONTS.heading,
    fontSize: 15,
    letterSpacing: -0.2,
    color: COLORS.textPrimary,
  },
  cardDesc: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  toggle: {
    width: 52,
    height: 30,
    borderRadius: 100,
    padding: 3,
    justifyContent: 'center',
  },
  knob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  actions: { paddingHorizontal: 24, paddingBottom: 30, paddingTop: 8 },
});
