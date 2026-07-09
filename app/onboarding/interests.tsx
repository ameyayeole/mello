import { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ACTIVITIES } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { ActivityId } from '@/types/models';
import { Button, Icon, IconName, PressableScale } from '@/components/ui';

export default function InterestsScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<ActivityId>>(new Set());

  function toggle(id: ActivityId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleContinue() {
    router.push('/auth/login');
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.stepRow}>
        <Text style={styles.stepText}>Step 2 of 2</Text>
        <View style={styles.stepTrack}>
          <View style={styles.stepFill} />
        </View>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>What are you into?</Text>
        <Text style={styles.subtitle}>
          Pick a few — we'll show events to match.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {ACTIVITIES.map((activity, i) => {
          const sel = selected.has(activity.id);
          const cat = categoryStyle(activity.id);
          return (
            <Animated.View
              key={activity.id}
              entering={FadeInDown.delay(60 + i * 40).duration(350)}
            >
              <PressableScale
                scaleTo={0.93}
                style={[
                  styles.pill,
                  sel && {
                    backgroundColor: cat.tint,
                    borderColor: cat.accent,
                    borderWidth: 1.5,
                  },
                ]}
                onPress={() => toggle(activity.id)}
              >
                <Icon
                  name={activity.id as IconName}
                  size={20}
                  color={sel ? cat.accent : 'rgba(15,24,44,0.55)'}
                />
                <Text style={[styles.pillLabel, sel && { color: cat.accent }]}>
                  {activity.label}
                </Text>
              </PressableScale>
            </Animated.View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={
            selected.size > 0
              ? `Continue · ${selected.size} selected`
              : 'Continue'
          }
          onPress={handleContinue}
          disabled={selected.size === 0}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
  },
  stepText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: 'rgba(15,24,44,0.45)',
  },
  stepTrack: {
    flex: 1,
    height: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(15,24,44,0.08)',
    overflow: 'hidden',
  },
  stepFill: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 10,
  },
  header: { paddingHorizontal: 22, paddingBottom: 6 },
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 22,
    paddingTop: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 100,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillLabel: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: 'rgba(15,24,44,0.7)',
  },
  footer: { padding: 22, paddingTop: 12 },
});
