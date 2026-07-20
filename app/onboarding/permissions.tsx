import { useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLocation } from '@/hooks/useLocation';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
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
    paddingHorizontal: SPACING[6],
    paddingTop: SPACING[7],
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.h1,
    lineHeight: 30,
    letterSpacing: -0.8,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    lineHeight: 21,
    color: COLORS.textSecondary,
    marginTop: SPACING[3],
  },
  list: { gap: SPACING[3.5], marginTop: SPACING[6] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3.5],
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: RADIUS.xl,
    padding: SPACING[4],
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.body,
    letterSpacing: -0.2,
    color: COLORS.textPrimary,
  },
  cardDesc: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 16,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  toggle: {
    width: 52,
    height: 30,
    borderRadius: RADIUS.full,
    padding: SPACING[0.5],
    justifyContent: 'center',
  },
  knob: {
    width: 24,
    height: 24,
    borderRadius: RADIUS.sm,
    backgroundColor: '#fff',
  },
  actions: { paddingHorizontal: SPACING[6], paddingBottom: SPACING[7], paddingTop: SPACING[2] },
});
