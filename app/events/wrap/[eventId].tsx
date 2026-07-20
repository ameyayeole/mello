import { useMemo } from 'react';
import { queryKeys } from '@/constants/queryKeys';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { getEventDetail } from '@/services/events.service';
import { hasWrapped } from '@/services/wrap.service';
import { useWrap, useWrapViewBump, wrapStepsDone, wrapStepTotal } from '@/hooks/useWrap';
import { useWrapGallery } from '@/hooks/useWrapGallery';
import { useAuthStore } from '@/stores/authStore';
import { WrapChecklist, WrapStep } from '@/components/wrap/WrapChecklist';
import WrapPhotoTile from '@/components/wrap/WrapPhotoTile';
import { ACTIVITY_MAP } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import {
  Button,
  Icon,
  PressableScale,
  Screen,
  ScreenHeader,
} from '@/components/ui';

// The post-event hub: checklist, gallery preview, run-it-back, and the
// locked/unlocked "night in numbers" recap.
export default function WrapHubScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const user = useAuthStore((s) => s.user);

  const eventQuery = useQuery({
    queryKey: queryKeys.eventDetail.of(eventId),
    queryFn: () => getEventDetail(eventId!),
    enabled: !!eventId,
  });
  const event = eventQuery.data;

  const { status, encore } = useWrap(eventId);
  const { sortedPhotos } = useWrapGallery(eventId);
  useWrapViewBump(eventId);

  const isAttendee = useMemo(() => {
    if (!event || !user) return true; // stay optimistic while loading
    if (event.host_id === user.id) return true;
    return event.participants.some(
      (p) => p.id === user.id && p.status === 'approved'
    );
  }, [event, user]);

  const ended = event ? hasWrapped(event) : true;
  const done = wrapStepsDone(status);
  const total = wrapStepTotal(status);
  const recapUnlocked = !!status && done >= total;
  const emoji = event ? (ACTIVITY_MAP[event.activity]?.emoji ?? '📍') : '📍';

  function openStep(step: WrapStep) {
    if (!eventId) return;
    if (step === 'rate') router.push(`/events/wrap/rate/${eventId}`);
    if (step === 'photos') router.push(`/events/wrap/photos/${eventId}`);
    if (step === 'superlatives') router.push(`/events/wrap/superlatives/${eventId}`);
    if (step === 'feedback') router.push(`/events/wrap/feedback/${eventId}`);
  }

  if (eventQuery.isLoading || !event) {
    return (
      <Screen style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
      </Screen>
    );
  }

  if (!ended || !isAttendee) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.guardTitle}>
          {!ended ? 'This event hasn’t wrapped yet' : 'This wrap is for attendees'}
        </Text>
        <Button
  variant="tertiary" label="Go back" onPress={() => router.back()} style={{ marginTop: 14 }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Event wrap" tone="transparent" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Event summary */}
        <Animated.View entering={FadeInDown.duration(350)} style={styles.hero}>
          <View style={styles.heroEmoji}>
            <Text style={{ fontSize: 30 }}>{emoji}</Text>
          </View>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={styles.heroMeta}>
            {event.location_name ? `${event.location_name} · ` : ''}
            {new Date(event.starts_at).toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(350)}>
          {status ? (
            <WrapChecklist
              status={status}
              expanded={status.viewCount <= 3 || done < total}
              onStepPress={openStep}
            />
          ) : (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />
          )}
        </Animated.View>

        {/* Gallery preview */}
        <Animated.View entering={FadeInDown.delay(140).duration(350)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>The photo pool</Text>
            <PressableScale
              scaleTo={0.95}
              hitSlop={8}
              onPress={() => router.push(`/events/wrap/gallery/${eventId}`)}
            >
              <Text style={styles.seeAll}>View all</Text>
            </PressableScale>
          </View>
          {sortedPhotos.length > 0 ? (
            <View style={styles.previewRow}>
              {sortedPhotos.slice(0, 3).map((p) => (
                <WrapPhotoTile
                  key={p.id}
                  photo={p}
                  onPress={() => router.push(`/events/wrap/gallery/${eventId}`)}
                />
              ))}
            </View>
          ) : (
            <PressableScale
              scaleTo={0.98}
              style={styles.emptyPool}
              onPress={() => router.push(`/events/wrap/photos/${eventId}`)}
            >
              <Icon name="camera" size={22} color={COLORS.primary} strokeWidth={2} />
              <Text style={styles.emptyPoolText}>
                No photos yet. Be the first, the 6 most-liked go to Explore.
              </Text>
            </PressableScale>
          )}
        </Animated.View>

        {/* Run it back */}
        <Animated.View entering={FadeInDown.delay(200).duration(350)}>
          <PressableScale
            scaleTo={0.98}
            style={[styles.encoreCard, status?.encoreRequested && styles.encoreCardOn]}
            onPress={() => encore.mutate(!status?.encoreRequested)}
            accessibilityRole="button"
            accessibilityLabel="Run it back"
          >
            <View style={[styles.encoreIcon, status?.encoreRequested && styles.encoreIconOn]}>
              <Icon
                name="refresh"
                size={20}
                color={status?.encoreRequested ? '#fff' : COLORS.primary}
                strokeWidth={2.2}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.encoreTitle}>
                {status?.encoreRequested ? 'You want a round two!' : 'Run it back?'}
              </Text>
              <Text style={styles.encoreSub}>
                {status?.encoreCount
                  ? `${status.encoreCount} ${status.encoreCount === 1 ? 'person wants' : 'people want'} this again`
                  : 'Tell the host you’d do this again'}
              </Text>
            </View>
            {status?.encoreRequested && (
              <Icon name="check" size={19} color={COLORS.success} strokeWidth={2.6} />
            )}
          </PressableScale>
        </Animated.View>

        {/* Night in numbers */}
        <Animated.View entering={FadeInDown.delay(260).duration(350)}>
          <PressableScale
            scaleTo={0.98}
            style={[styles.recapCard, !recapUnlocked && styles.recapLocked]}
            onPress={() =>
              recapUnlocked && router.push(`/events/wrap/recap/${eventId}`)
            }
            disabled={!recapUnlocked}
            accessibilityRole="button"
            accessibilityLabel="Your night in numbers"
          >
            <View style={styles.recapIcon}>
              <Icon
                name={recapUnlocked ? 'thumbsUp' : 'lock'}
                size={20}
                color={recapUnlocked ? '#fff' : 'rgba(255,255,255,0.8)'}
                strokeWidth={2.2}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.recapTitle}>Your night in numbers</Text>
              <Text style={styles.recapSub}>
                {recapUnlocked
                  ? 'Winners, thumbs and totals from the night'
                  : `Finish ${total - done} more ${total - done === 1 ? 'step' : 'steps'} to unlock`}
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color="rgba(255,255,255,0.7)" />
          </PressableScale>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 30 },
  guardTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  scroll: { padding: 18, paddingTop: 8, gap: 18, paddingBottom: 30 },
  hero: { alignItems: 'center', gap: 6, paddingVertical: 6 },
  heroEmoji: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 22,
    letterSpacing: -0.44,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  heroMeta: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 16,
    letterSpacing: -0.32,
    color: COLORS.textPrimary,
  },
  seeAll: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.primary,
  },
  previewRow: { flexDirection: 'row', gap: 8 },
  emptyPool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
  },
  emptyPoolText: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: COLORS.textSecondary,
  },
  encoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
  },
  encoreCardOn: {
    borderColor: 'rgba(255,94,91,0.35)',
    backgroundColor: COLORS.primaryTint,
  },
  encoreIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  encoreIconOn: { backgroundColor: COLORS.primary },
  encoreTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: COLORS.textPrimary,
  },
  encoreSub: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  recapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.accent,
    borderRadius: 18,
    padding: 16,
  },
  recapLocked: { opacity: 0.92 },
  recapIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recapTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 15,
    letterSpacing: -0.3,
    color: '#fff',
  },
  recapSub: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
  },
});
