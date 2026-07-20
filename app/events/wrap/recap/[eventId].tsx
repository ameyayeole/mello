import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { queryKeys } from '@/constants/queryKeys';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useWrapSummary } from '@/hooks/useWrap';
import { useWrapGallery } from '@/hooks/useWrapGallery';
import { getEventDetail } from '@/services/events.service';
import { SUPERLATIVE_MAP } from '@/constants/superlatives';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Avatar, NavButton, PressableScale } from '@/components/ui';
import { SuperlativeWinner } from '@/types/models';

function StatCard({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AwardCard({ winner }: { winner: SuperlativeWinner }) {
  const meta = SUPERLATIVE_MAP[winner.category];
  return (
    <View style={styles.awardCard}>
      <Avatar
        name={winner.winner_name}
        photoUrl={winner.winner_photo_url}
        size={52}
      />
      <Text style={styles.awardName} numberOfLines={1}>
        {winner.winner_name ?? '—'}
      </Text>
      <Text style={styles.awardLabel} numberOfLines={1}>
        {meta?.label?.toUpperCase() ?? ''}
      </Text>
    </View>
  );
}

// The one dark, celebratory moment: the night's numbers, award winners and a
// glimpse of the gallery. Unlocked by finishing the wrap checklist.
export default function WrapRecapScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const summaryQuery = useWrapSummary(eventId, true);
  const summary = summaryQuery.data;
  const { sortedPhotos } = useWrapGallery(eventId);

  const { data: event } = useQuery({
    queryKey: queryKeys.eventDetail.of(eventId),
    queryFn: () => getEventDetail(eventId!),
    enabled: !!eventId,
  });

  const dateLabel = event?.starts_at
    ? new Date(event.starts_at).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : '';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {/* confetti — kept to the clear upper-right so it never sits on the text */}
      <View style={[styles.confetti, { top: 150, right: 34, backgroundColor: COLORS.primary }]} />
      <View style={[styles.confetti, styles.square, { top: 205, right: 70, backgroundColor: COLORS.secondary }]} />
      <View style={[styles.confetti, { top: 120, right: 96, width: 8, height: 8, backgroundColor: COLORS.success }]} />
      <View style={[styles.confetti, styles.square, { top: 250, right: 40, backgroundColor: COLORS.catCoffee }]} />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <NavButton
            color={COLORS.white}
            onPress={() => router.back()}
            accessibilityLabel="Back"
          />
        </View>

        {summaryQuery.isLoading || !summary ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View entering={FadeInDown.duration(350)}>
              <Text style={styles.overline}>That's a wrap</Text>
              <Text style={styles.title}>{event?.title ?? 'Your night'}</Text>
              {(dateLabel || event?.host?.name) && (
                <Text style={styles.subtitle}>
                  {[dateLabel, event?.host?.name ? `hosted by ${event.host.name}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              )}
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(80).duration(350)}
              style={styles.stats}
            >
              <StatCard value={summary.photoCount} label="Photos" color={COLORS.primary} />
              <StatCard value={summary.attendeeCount} label="People" color={COLORS.secondary} />
              <StatCard value={summary.likeCount} label="Likes" color={COLORS.success} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(160).duration(350)}>
              <Text style={styles.sectionTitle}>Superlatives 🏆</Text>
              {summary.superlatives.length > 0 ? (
                <View style={styles.awardRow}>
                  {summary.superlatives.slice(0, 2).map((w) => (
                    <AwardCard key={w.category} winner={w} />
                  ))}
                </View>
              ) : (
                <Text style={styles.noVotes}>
                  No superlative votes yet. Rally the group!
                </Text>
              )}
            </Animated.View>

            {sortedPhotos.length > 0 && (
              <Animated.View
                entering={FadeInDown.delay(220).duration(350)}
                style={styles.photoStrip}
              >
                {sortedPhotos.slice(0, 3).map((p, i) => {
                  const extra = sortedPhotos.length - 3;
                  const isLast = i === 2 && extra > 0;
                  return (
                    <PressableScale
                      key={p.id}
                      scaleTo={0.96}
                      style={styles.photoTile}
                      onPress={() =>
                        router.push(`/events/wrap/gallery/${eventId}`)
                      }
                    >
                      <Image
                        source={{ uri: p.url }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={150}
                      />
                      {isLast && (
                        <View style={styles.photoMore}>
                          <Text style={styles.photoMoreText}>+{extra}</Text>
                        </View>
                      )}
                    </PressableScale>
                  );
                })}
              </Animated.View>
            )}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <PressableScale
            scaleTo={0.97}
            style={[styles.footerBtn, styles.footerBtnGhost]}
            onPress={() => router.push(`/events/wrap/feedback/${eventId}`)}
          >
            <Text style={styles.footerBtnText}>Send a note</Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.97}
            style={[styles.footerBtn, styles.footerBtnPrimary]}
            onPress={() => router.push(`/events/wrap/gallery/${eventId}`)}
          >
            <Text style={styles.footerBtnText}>See all photos</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141018' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  confetti: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    zIndex: 1,
  },
  square: { width: 10, height: 10, borderRadius: 2, transform: [{ rotate: '20deg' }] },
  header: { paddingHorizontal: 12, paddingVertical: 6, zIndex: 2 },
  scroll: { paddingHorizontal: 22, paddingTop: 10, gap: 24, paddingBottom: 20 },
  overline: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: COLORS.primary,
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: 34,
    lineHeight: 35,
    letterSpacing: -1,
    color: '#fff',
    marginTop: 8,
  },
  subtitle: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
  },
  stats: { flexDirection: 'row', gap: 11 },
  statCard: { flex: 1, borderRadius: 20, paddingVertical: 16, paddingHorizontal: 14 },
  statValue: { fontFamily: FONTS.heading, fontSize: 28, color: '#fff' },
  statLabel: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: FONTS.heading,
    fontSize: 15,
    color: '#fff',
    marginBottom: 12,
  },
  awardRow: { flexDirection: 'row', gap: 11 },
  awardCard: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18,
    padding: 14,
  },
  awardName: { fontFamily: FONTS.heading, fontSize: 13, color: '#fff' },
  awardLabel: { fontFamily: FONTS.bold, fontSize: 10, color: COLORS.primary },
  noVotes: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  photoStrip: { flexDirection: 'row', gap: 8 },
  photoTile: {
    flex: 1,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  photoMore: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20,16,24,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoMoreText: { fontFamily: FONTS.heading, fontSize: 15, color: '#fff' },
  footer: {
    flexDirection: 'row',
    gap: 11,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 30,
  },
  footerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  footerBtnGhost: { backgroundColor: 'rgba(255,255,255,0.12)' },
  footerBtnPrimary: { backgroundColor: COLORS.primary },
  footerBtnText: { fontFamily: FONTS.heading, fontSize: 14, color: '#fff' },
});
