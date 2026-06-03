import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ACTIVITIES } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { ActivityId } from '@/types/models';

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
      <View style={styles.header}>
        <Text style={styles.title}>What are you into?</Text>
        <Text style={styles.subtitle}>
          Pick your interests so we can match you with the right events.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {ACTIVITIES.map((activity) => {
          const isSelected = selected.has(activity.id);
          return (
            <TouchableOpacity
              key={activity.id}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => toggle(activity.id)}
            >
              <Text style={styles.emoji}>{activity.emoji}</Text>
              <Text
                style={[styles.label, isSelected && styles.labelSelected]}
              >
                {activity.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.primaryBtn,
            selected.size === 0 && styles.primaryBtnDisabled,
          ]}
          onPress={handleContinue}
          disabled={selected.size === 0}
        >
          <Text style={styles.primaryBtnText}>
            Continue {selected.size > 0 ? `(${selected.size})` : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: 24, paddingTop: 48 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, lineHeight: 24 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  card: {
    width: '47%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#FFF0EF',
  },
  emoji: { fontSize: 32 },
  label: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
  labelSelected: { color: COLORS.primary },
  footer: { padding: 24 },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryBtnDisabled: { backgroundColor: COLORS.disabled },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
