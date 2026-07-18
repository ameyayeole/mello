import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useWrapSummary } from '@/hooks/useWrap';
import SuperlativeBadge from '@/components/wrap/SuperlativeBadge';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { IconButton } from '@/components/ui';

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// "Your night in numbers": totals, your thumbs received, and the award
// winners. Unlocked by finishing the checklist.
export default function WrapRecapScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const summaryQuery = useWrapSummary(eventId, true);
  const summary = summaryQuery.data;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton icon="back" variant="ghost" onPress={() => router.back()} accessibilityLabel="Back" />
        <Text style={styles.headerTitle}>Your night in numbers</Text>
        <View style={{ width: 40 }} />
      </View>

      {summaryQuery.isLoading || !summary ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Your headline number */}
          <Animated.View entering={FadeInDown.duration(350)} style={styles.heroCard}>
            <Text style={styles.heroEmoji}>👏</Text>
            <Text style={styles.heroValue}>{summary.myThumbsReceived}</Text>
            <Text style={styles.heroLabel}>
              {summary.myThumbsReceived === 1
                ? 'person gave you a thumbs up'
                : 'people gave you a thumbs up'}
            </Text>
          </Animated.View>

          {/* Event totals */}
          <Animated.View entering={FadeInDown.delay(80).duration(350)} style={styles.statsCard}>
            <View style={styles.statsRow}>
              <Stat value={summary.attendeeCount} label="were there" />
              <View style={styles.statDivider} />
              <Stat value={summary.photoCount} label="photos shared" />
              <View style={styles.statDivider} />
              <Stat value={summary.likeCount} label="photo likes" />
            </View>
            <View style={styles.statsSeparator} />
            <View style={styles.statsRow}>
              <Stat value={summary.commentCount} label="comments" />
              <View style={styles.statDivider} />
              <Stat value={summary.messageCount} label="chat messages" />
            </View>
          </Animated.View>

          {/* Awards */}
          <Animated.View entering={FadeInDown.delay(160).duration(350)}>
            <Text style={styles.sectionTitle}>The awards</Text>
            <View style={styles.awardList}>
              {summary.superlatives.length > 0 ? (
                summary.superlatives.map((w) => (
                  <SuperlativeBadge key={w.category} winner={w} />
                ))
              ) : (
                <Text style={styles.noVotes}>
                  No superlative votes yet. Rally the group!
                </Text>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 17,
    letterSpacing: -0.34,
    color: COLORS.textPrimary,
  },
  scroll: { padding: 18, paddingTop: 10, gap: 16, paddingBottom: 30 },
  heroCard: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accent,
    borderRadius: 24,
    paddingVertical: 28,
  },
  heroEmoji: { fontSize: 34 },
  heroValue: {
    fontFamily: FONTS.heavy,
    fontSize: 52,
    letterSpacing: -1,
    color: '#fff',
    lineHeight: 58,
  },
  heroLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.75)',
  },
  statsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 18,
    paddingHorizontal: 10,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statsSeparator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 15,
    marginHorizontal: 14,
  },
  stat: { alignItems: 'center', flex: 1 },
  statValue: {
    fontFamily: FONTS.heavy,
    fontSize: 26,
    letterSpacing: -0.52,
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statDivider: { width: 1, height: 34, backgroundColor: COLORS.border },
  sectionTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 16,
    letterSpacing: -0.32,
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  awardList: { gap: 9 },
  noVotes: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
});
