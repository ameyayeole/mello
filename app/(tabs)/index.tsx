import { useQuery } from '@tanstack/react-query';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { getJoinedEvents, getMyEvents } from '@/services/events.service';
import { COLORS } from '@/constants/colors';
import { ACTIVITY_MAP } from '@/constants/activities';
import { NearbyEvent } from '@/types/models';
import { formatEventTime } from '@/utils/time';
import { formatDistance } from '@/utils/distance';

function EventCard({
  event,
  onPress,
}: {
  event: NearbyEvent;
  onPress: () => void;
}) {
  const activity = ACTIVITY_MAP[event.activity];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardEmoji}>{activity.emoji}</Text>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{event.title}</Text>
          <Text style={styles.cardTime}>{formatEventTime(event.starts_at)}</Text>
        </View>
        {event.distance_m != null && (
          <Text style={styles.cardDistance}>
            {formatDistance(event.distance_m)}
          </Text>
        )}
      </View>
      {event.location_name && (
        <Text style={styles.cardLocation}>📍 {event.location_name}</Text>
      )}
      <View style={styles.cardFooter}>
        <Text style={styles.cardParticipants}>
          👥 {event.participant_count ?? 0}/{event.max_people ?? '∞'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const cityName = useLocationStore((s) => s.cityName);

  const joinedQuery = useQuery({
    queryKey: ['joinedEvents', user?.id],
    queryFn: () => getJoinedEvents(user!.id),
    enabled: !!user,
  });

  const myEventsQuery = useQuery({
    queryKey: ['myEvents', user?.id],
    queryFn: () => getMyEvents(user!.id),
    enabled: !!user,
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>
              Hey {user?.name?.split(' ')[0] ?? 'there'} 👋
            </Text>
            <Text style={styles.location}>📍 {cityName}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.notifBtn}
              onPress={() => router.push('/notifications')}
            >
              <Text style={styles.notifEmoji}>🔔</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => router.push('/profile')}
            >
              <Text style={styles.profileInitial}>
                {user?.name?.[0]?.toUpperCase() ?? '👤'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => router.push('/events/create')}
          >
            <Text style={styles.createBtnText}>+ Create Event</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapBtn}
            onPress={() => router.push('/(tabs)/map')}
          >
            <Text style={styles.mapBtnText}>🗺️ Explore Map</Text>
          </TouchableOpacity>
        </View>

        {/* Joined events */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Events you're joining bla bla</Text>
          {joinedQuery.isLoading ? (
            <Text style={styles.emptyText}>Loading...</Text>
          ) : joinedQuery.data?.length === 0 ? (
            <Text style={styles.emptyText}>
              No events yet. Explore the map to find something!
            </Text>
          ) : (
            <View style={styles.cardList}>
              {joinedQuery.data?.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onPress={() => router.push(`/(tabs)/chats/${event.id}`)}
                />
              ))}
            </View>
          )}
        </View>

        {/* My hosted events */}
        {(myEventsQuery.data?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Events you're hosting</Text>
            <View style={styles.cardList}>
              {myEventsQuery.data?.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onPress={() => router.push(`/(tabs)/chats/${event.id}`)}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingTop: 12,
  },
  greeting: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary },
  location: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifEmoji: { fontSize: 18 },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: { fontSize: 18, fontWeight: '700', color: '#fff' },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  createBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  mapBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mapBtnText: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 15 },
  section: { padding: 20, paddingTop: 16 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  cardList: { gap: 12 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardEmoji: { fontSize: 28 },
  cardInfo: { flex: 1 },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  cardTime: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  cardDistance: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  cardLocation: { fontSize: 13, color: COLORS.textSecondary },
  cardFooter: { flexDirection: 'row', alignItems: 'center' },
  cardParticipants: { fontSize: 13, color: COLORS.textSecondary },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
