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
import { getEventDetail } from '@/services/events.service';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { formatEventTime } from '@/utils/time';
import ParticipantRow from '@/components/events/ParticipantRow';
import {
  Button,
  CategoryTile,
  Icon,
  IconButton,
  PressableScale,
} from '@/components/ui';

// How many attendees / requests show inline before "See all" takes over.
const PREVIEW_COUNT = 3;

export default function HostPanelScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: event, isLoading } = useQuery({
    queryKey: ['eventDetail', eventId],
    queryFn: () => getEventDetail(eventId),
    enabled: !!eventId,
  });

  const isHost = !!event && event.host_id === user?.id;
  const attendees = (event?.participants ?? []).filter(
    (p) => p.status === 'approved' && p.id !== user?.id
  );
  const requests = (event?.participants ?? []).filter(
    (p) => p.status === 'pending'
  );

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
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={styles.headerTitle} numberOfLines={1}>
          Manage event
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
});
