import { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, Icon, IconName } from '@/components/ui';

const RULES: {
  icon: IconName;
  title: string;
  desc: string;
  accent: string;
  tint: string;
}[] = [
  {
    icon: 'user',
    title: 'Be real & respectful',
    desc: 'Real name, real photos. Treat everyone kindly.',
    accent: COLORS.primary,
    tint: COLORS.primaryTint,
  },
  {
    icon: 'shield',
    title: 'Keep it safe',
    desc: 'Meet in public. No harassment, ever.',
    accent: COLORS.success,
    tint: COLORS.successTint,
  },
  {
    icon: 'calendar',
    title: 'Show up',
    desc: "RSVP means you're coming. Flaking hurts hosts.",
    accent: COLORS.secondary,
    tint: COLORS.secondaryTint,
  },
  {
    icon: 'flag',
    title: 'Speak up',
    desc: 'Report anything that feels off. We act fast.',
    accent: COLORS.catCoffee,
    tint: '#FEEEDD',
  },
];

export default function GuidelinesScreen() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View entering={FadeInDown.duration(400)}>
          <View style={styles.badge}>
            <Icon name="heart" size={30} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>The house rules</Text>
          <Text style={styles.subtitle}>
            Mello only works if everyone shows up as their best self. Agree to
            keep it good.
          </Text>
        </Animated.View>

        <View style={styles.list}>
          {RULES.map((r, i) => (
            <Animated.View
              key={r.title}
              entering={FadeInDown.delay(100 + i * 70).duration(400)}
              style={styles.row}
            >
              <View style={[styles.rowIcon, { backgroundColor: r.tint }]}>
                <Icon name={r.icon} size={16} color={r.accent} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{r.title}</Text>
                <Text style={styles.rowDesc}>{r.desc}</Text>
              </View>
            </Animated.View>
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.agreeRow}
          activeOpacity={0.8}
          onPress={() => setAgreed((v) => !v)}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
            {agreed && <Icon name="check" size={14} color="#fff" strokeWidth={3} />}
          </View>
          <Text style={styles.agreeText}>
            I've read and agree to the guidelines
          </Text>
        </TouchableOpacity>
        <Button
          label="Agree & continue"
          disabled={!agreed}
          onPress={() => router.push('/auth/login')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 26 },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: 27,
    lineHeight: 28,
    letterSpacing: -0.7,
    color: COLORS.textPrimary,
    marginTop: 16,
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textSecondary,
    marginTop: 10,
  },
  list: { gap: 14, marginTop: 22 },
  row: { flexDirection: 'row', gap: 13, alignItems: 'flex-start' },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: {
    fontFamily: FONTS.heading,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  rowDesc: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    lineHeight: 16.8,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  actions: { paddingHorizontal: 24, paddingBottom: 30, paddingTop: 8 },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  agreeText: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: '#5C5860',
  },
});
