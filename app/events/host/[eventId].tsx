import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import LottieView from 'lottie-react-native';
import {
  countEventSavers,
  getEventDetail,
  getEventSavers,
} from '@/services/events.service';
import { getEventFeedback, hasWrapped } from '@/services/wrap.service';
import { useWrap } from '@/hooks/useWrap';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { formatEventTime } from '@/utils/time';
import { isPremium, PREMIUM_GOLD, PREMIUM_GOLD_TINT } from '@/utils/premium';
import ParticipantRow from '@/components/events/ParticipantRow';
import BoostCard from '@/components/events/BoostCard';
import {
  Avatar,
  Button,
  CategoryTile,
  Icon,
  IconButton,
  PressableScale,
} from '@/components/ui';

// How many attendees / requests show inline before "See all" takes over.
const PREVIEW_COUNT = 3;

export default function HostPanelScreen() {
  // celebrate=1 is passed only right after the in-map creation flow finishes:
  // same screen, but it opens on a "you're hosting!" note.
  const { eventId, celebrate } = useLocalSearchParams<{
    eventId: string;
    celebrate?: string;
  }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: event, isLoading } = useQuery({
    queryKey: ['eventDetail', eventId],
    queryFn: () => getEventDetail(eventId),
    enabled: !!eventId,
  });

  const isHost = !!event && event.host_id === user?.id;
  const premium = isPremium(user);
  const ended = !!event && hasWrapped(event);

  // Post-event: anonymous feedback aggregate + encore demand.
  const { status: wrapStatus } = useWrap(ended ? eventId : undefined);
  const { data: feedbackSummary } = useQuery({
    queryKey: ['eventFeedback', eventId],
    queryFn: () => getEventFeedback(eventId!),
    enabled: !!eventId && ended && isHost,
    staleTime: 60_000,
  });
  const attendees = (event?.participants ?? []).filter(
    (p) => p.status === 'approved' && p.id !== user?.id
  );
  // Mello+ members' requests surface first.
  const requests = (event?.participants ?? [])
    .filter((p) => p.status === 'pending')
    .sort((a, b) => Number(isPremium(b)) - Number(isPremium(a)));

  // Wishlist insight: every host gets the count; only Mello+ hosts get names.
  const { data: saversCount = 0 } = useQuery({
    queryKey: ['eventSaversCount', eventId],
    queryFn: () => countEventSavers(eventId),
    enabled: isHost,
    retry: 1,
  });
  const { data: savers = [] } = useQuery({
    queryKey: ['eventSavers', eventId],
    queryFn: () => getEventSavers(eventId),
    enabled: isHost && premium,
    retry: 1,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['eventDetail', eventId] });
    qc.invalidateQueries({ queryKey: ['myEvents'] });
  };

  if (isLoading || !event) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!isHost) {
    // Not this user's event — nothing to manage here.
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <IconButton
            icon="back"
            variant="ghost"
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          />
        </View>
        <Text style={styles.notHostText}>
          Only the host can manage this event.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with the Edit action up top */}
      <View style={styles.header}>
        <IconButton
          icon="back"
          variant="ghost"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {celebrate === '1' ? 'Your new event' : 'Manage event'}
        </Text>
        <PressableScale
          scaleTo={0.93}
          style={styles.editBtn}
          onPress={() => router.push(`/events/edit/${event.id}`)}
        >
          <Icon name="edit" size={14} color={COLORS.primary} strokeWidth={2} />
          <Text style={styles.editBtnText}>Edit</Text>
        </PressableScale>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {celebrate === '1' && (
          <Animated.View
            entering={FadeInDown.duration(400)}
            style={styles.congratsCard}
          >
            <Text style={styles.congratsEmoji}>🎉</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.congratsTitle}>You're hosting!</Text>
              <Text style={styles.congratsSub}>
                Your event is live on the map. We'll let you know as people
                join — this is your event HQ.
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Event info */}
        <Animated.View entering={FadeInDown.duration(350)} style={styles.card}>
          {event.image_url && (
            <Image
              source={{ uri: event.image_url }}
              style={styles.cover}
              contentFit="cover"
              transition={200}
            />
          )}
          <View style={styles.titleRow}>
            <CategoryTile activity={event.activity} size={44} radius={13} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>{event.title}</Text>
              <View style={styles.metaRow}>
                <Icon name="clock" size={13} color="rgba(15,24,44,0.6)" />
                <Text style={styles.metaText}>
                  {formatEventTime(event.starts_at)}
                </Text>
              </View>
            </View>
            <View style={styles.spotsPill}>
              <Text style={styles.spotsPillText}>
                {event.participant_count}
                {event.max_people ? `/${event.max_people}` : ''} going
              </Text>
            </View>
          </View>

          {event.location_name && (
            <View style={styles.locationRow}>
              <Icon name="location" size={15} color={COLORS.primary} />
              <Text style={styles.location} numberOfLines={1}>
                {event.location_name}
              </Text>
            </View>
          )}

          {event.description && (
            <Text style={styles.description}>{event.description}</Text>
          )}
        </Animated.View>

        {/* Door check-in — hidden once the event has wrapped */}
        {!ended && (
          <Animated.View entering={FadeInDown.delay(20).duration(350)}>
            <PressableScale
              scaleTo={0.98}
              style={styles.checkinCard}
              onPress={() => router.push(`/events/checkin/${event.id}`)}
              accessibilityRole="button"
              accessibilityLabel="Open door check-in"
            >
              <View style={styles.checkinIcon}>
                <Icon name="scan" size={22} color="#fff" strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.checkinTitle}>Check in guests</Text>
                <Text style={styles.checkinSub}>
                  Show your QR — guests scan to check in
                </Text>
              </View>
              <Icon name="chevronRight" size={20} color={COLORS.textMuted} />
            </PressableScale>
          </Animated.View>
        )}

        {/* Boost — sell the ₹69 boost, or show the live boost's impact */}
        <Animated.View entering={FadeInDown.delay(30).duration(350)}>
          <BoostCard
            event={event}
            saversCount={saversCount}
            onBoosted={invalidate}
          />
        </Animated.View>

        {/* Post-event: how it landed */}
        {ended && (
          <Animated.View entering={FadeInDown.delay(45).duration(350)}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>After the event</Text>
            </View>
            <View style={styles.wrapPanel}>
              <View style={styles.wrapStatsRow}>
                <View style={styles.wrapStat}>
                  <Text style={styles.wrapStatValue}>
                    👍 {feedbackSummary?.upCount ?? 0}
                  </Text>
                  <Text style={styles.wrapStatLabel}>loved it</Text>
                </View>
                <View style={styles.wrapStatDivider} />
                <View style={styles.wrapStat}>
                  <Text style={styles.wrapStatValue}>
                    👎 {feedbackSummary?.downCount ?? 0}
                  </Text>
                  <Text style={styles.wrapStatLabel}>not great</Text>
                </View>
                <View style={styles.wrapStatDivider} />
                <View style={styles.wrapStat}>
                  <Text style={styles.wrapStatValue}>
                    🔁 {wrapStatus?.encoreCount ?? 0}
                  </Text>
                  <Text style={styles.wrapStatLabel}>want it again</Text>
                </View>
              </View>
              {(feedbackSummary?.notes?.length ?? 0) > 0 && (
                <View style={styles.wrapNotes}>
                  {feedbackSummary!.notes.slice(0, 3).map((n, i) => (
                    <Text key={i} style={styles.wrapNoteText}>
                      “{n}”
                    </Text>
                  ))}
                  <Text style={styles.wrapNotesHint}>
                    Feedback is anonymous.
                  </Text>
                </View>
              )}
              <Button
                label="Open the event wrap"
                variant="secondary"
                height={44}
                onPress={() => router.push(`/events/wrap/${event.id}`)}
              />
            </View>
          </Animated.View>
        )}

        {/* Join requests */}
        {requests.length > 0 && (
          <Animated.View entering={FadeInDown.delay(60).duration(350)}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Requests · {requests.length}
              </Text>
              {requests.length > PREVIEW_COUNT && (
                <Text
                  style={styles.seeAll}
                  onPress={() =>
                    router.push(
                      `/events/attendees/${event.id}?tab=requests`
                    )
                  }
                >
                  See all
                </Text>
              )}
            </View>
            <View style={styles.rows}>
              {requests.slice(0, PREVIEW_COUNT).map((p) => (
                <ParticipantRow
                  key={p.id}
                  eventId={event.id}
                  person={p}
                  onChanged={invalidate}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {/* Wishlist insight (Mello+): who saved this event */}
        {saversCount > 0 && (
          <Animated.View entering={FadeInDown.delay(90).duration(350)}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Wishlisted · {saversCount}
              </Text>
            </View>
            {premium ? (
              <View style={styles.saversCard}>
                {savers.slice(0, 8).map((s) => (
                  <PressableScale
                    key={s.id}
                    scaleTo={0.94}
                    style={styles.saverChip}
                    onPress={() => router.push(`/friends/${s.id}`)}
                  >
                    <Avatar name={s.name} photoUrl={s.photo_url} size={24} />
                    <Text style={styles.saverName} numberOfLines={1}>
                      {s.name}
                    </Text>
                  </PressableScale>
                ))}
                {savers.length > 8 && (
                  <View style={styles.saverChip}>
                    <Text style={styles.saverName}>+{savers.length - 8}</Text>
                  </View>
                )}
              </View>
            ) : (
              <PressableScale
                scaleTo={0.98}
                style={styles.saversLocked}
                onPress={() => router.push('/premium?reason=wishlist')}
                accessibilityRole="button"
                accessibilityLabel="See who wishlisted this event with Mello+"
              >
                <View style={styles.saversLockedIcon}>
                  <Icon name="crown" size={18} color={PREMIUM_GOLD} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.saversLockedTitle}>
                    {saversCount} {saversCount === 1 ? 'person has' : 'people have'}{' '}
                    wishlisted this
                  </Text>
                  <Text style={styles.saversLockedSub}>
                    See who with Mello+
                  </Text>
                </View>
                <Icon name="chevronRight" size={18} color={PREMIUM_GOLD} />
              </PressableScale>
            )}
          </Animated.View>
        )}

        {/* Attendees */}
        <Animated.View entering={FadeInDown.delay(120).duration(350)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Attendees · {attendees.length}
            </Text>
            {attendees.length > PREVIEW_COUNT && (
              <Text
                style={styles.seeAll}
                onPress={() =>
                  router.push(`/events/attendees/${event.id}?tab=attendees`)
                }
              >
                See all
              </Text>
            )}
          </View>
          {attendees.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                No one has joined yet. Share your event to get it going!
              </Text>
            </View>
          ) : (
            <View style={styles.rows}>
              {attendees.slice(0, PREVIEW_COUNT).map((p) => (
                <ParticipantRow
                  key={p.id}
                  eventId={event.id}
                  person={p}
                  onChanged={invalidate}
                />
              ))}
            </View>
          )}
        </Animated.View>

        <Button
          label="Open event chat"
          onPress={() => router.push(`/(tabs)/chats/${event.id}`)}
          style={{ marginTop: 6 }}
        />
      </ScrollView>

      {/* One-shot confetti burst over the whole screen right after creation. */}
      {celebrate === '1' && (
        <LottieView
          source={require('../../../assets/lottie/celebration.json')}
          autoPlay
          loop={false}
          resizeMode="cover"
          style={styles.celebrationOverlay}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FONTS.heavy,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 100,
    backgroundColor: COLORS.primaryTint,
  },
  editBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.primary,
  },
  notHostText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 40,
  },
  scroll: { padding: 20, paddingTop: 8, gap: 18, paddingBottom: 32 },
  congratsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: COLORS.primaryTint,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,94,91,0.25)',
    padding: 15,
  },
  congratsEmoji: { fontSize: 30, lineHeight: 36 },
  celebrationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    pointerEvents: 'none',
  },
  checkinCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,94,91,0.28)',
    padding: 14,
  },
  checkinIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkinTitle: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  checkinSub: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  congratsTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  congratsSub: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    lineHeight: 17,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.07)',
    padding: 15,
    gap: 12,
  },
  cover: { width: '100%', height: 160, borderRadius: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    lineHeight: 23,
    color: COLORS.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  metaText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: 'rgba(15,24,44,0.6)',
  },
  spotsPill: {
    backgroundColor: 'rgba(31,164,99,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  spotsPillText: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    color: COLORS.success,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  location: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: COLORS.textPrimary,
  },
  description: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textPrimary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  seeAll: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.primary,
  },
  wrapPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 14,
  },
  wrapStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  wrapStat: { alignItems: 'center', flex: 1 },
  wrapStatValue: {
    fontFamily: FONTS.heavy,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
  wrapStatLabel: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  wrapStatDivider: { width: 1, height: 30, backgroundColor: COLORS.border },
  wrapNotes: {
    gap: 6,
    backgroundColor: COLORS.background,
    borderRadius: 13,
    padding: 12,
  },
  wrapNoteText: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.textPrimary,
  },
  wrapNotesHint: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  rows: { gap: 8 },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.07)',
    padding: 16,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  saversCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.07)',
    padding: 12,
  },
  saverChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 34,
    paddingLeft: 5,
    paddingRight: 12,
    borderRadius: 100,
    backgroundColor: COLORS.background,
    maxWidth: 160,
  },
  saverName: {
    flexShrink: 1,
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.textPrimary,
  },
  saversLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(201,147,10,0.35)',
    padding: 12,
  },
  saversLockedIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: PREMIUM_GOLD_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saversLockedTitle: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: COLORS.textPrimary,
  },
  saversLockedSub: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: PREMIUM_GOLD,
    marginTop: 1,
  },
});
