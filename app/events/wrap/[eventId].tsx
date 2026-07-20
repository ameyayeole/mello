import { useMemo } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
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
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import {
  Button,
  Icon,
  Loader,
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
        <Loader inline />
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
  variant="tertiary" label="Go back" onPress={() => router.back()} style={{ marginTop: SPACING[3.5] }} />
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
            <Text style={{ fontSize: TYPE_SIZE.h1 }}>{emoji}</Text>
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
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: SPACING[5] }} />
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
  center: { alignItems: 'center', justifyContent: 'center', padding: SPACING[7] },
  guardTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyLg,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  scroll: { padding: SPACING[4], paddingTop: SPACING[2], gap: SPACING[4], paddingBottom: SPACING[7] },
  hero: { alignItems: 'center', gap: SPACING[1.5], paddingVertical: SPACING[1.5] },
  heroEmoji: {
    width: 64,
    height: 64,
    borderRadius: RADIUS['2xl'],
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[1],
  },
  heroTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    letterSpacing: -0.44,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  heroMeta: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING[2.5],
  },
  sectionTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.bodyLg,
    letterSpacing: -0.32,
    color: COLORS.textPrimary,
  },
  seeAll: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.primary,
  },
  previewRow: { flexDirection: 'row', gap: SPACING[2] },
  emptyPool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING[3.5],
  },
  emptyPoolText: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 17,
    color: COLORS.textSecondary,
  },
  encoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING[3.5],
  },
  encoreCardOn: {
    borderColor: 'rgba(255,94,91,0.35)',
    backgroundColor: COLORS.primaryTint,
  },
  encoreIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  encoreIconOn: { backgroundColor: COLORS.primary },
  encoreTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  encoreSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  recapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.xl,
    padding: SPACING[4],
  },
  recapLocked: { opacity: 0.92 },
  recapIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recapTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.body,
    letterSpacing: -0.3,
    color: '#fff',
  },
  recapSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: 'rgba(255,255,255,0.7)',
    marginTop: SPACING[0.5],
  },
});
