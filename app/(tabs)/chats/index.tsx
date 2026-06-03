import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getJoinedEvents } from '@/services/events.service';
import { getMyEvents } from '@/services/events.service';
import { ACTIVITY_MAP } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { NearbyEvent } from '@/types/models';
import { formatEventTime } from '@/utils/time';

function ChatRow({ event }: { event: NearbyEvent }) {
  const router = useRouter();
  const activity = ACTIVITY_MAP[event.activity];

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/(tabs)/chats/${event.id}`)}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarEmoji}>{activity.emoji}</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle}>{event.title}</Text>
        <Text style={styles.rowSub}>{formatEventTime(event.starts_at)}</Text>
      </View>
      <View style={styles.participantBadge}>
        <Text style={styles.participantCount}>
          {event.participant_count ?? 0} joined
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ChatsListScreen() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

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

  const allChats = [
    ...(myEventsQuery.data ?? []),
    ...(joinedQuery.data ?? []).filter(
      (e) => !myEventsQuery.data?.some((m) => m.id === e.id)
    ),
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
      </View>

      {allChats.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={styles.emptyTitle}>No chats yet</Text>
          <Text style={styles.emptyText}>
            Join or create an event to start chatting with participants.
          </Text>
          <TouchableOpacity
            style={styles.exploreBtn}
            onPress={() => router.push('/(tabs)/map')}
          >
            <Text style={styles.exploreBtnText}>Explore Map</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={allChats}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatRow event={item} />}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: 20, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary },
  list: { padding: 16, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginBottom: 8,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF0EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 22 },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  rowSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  participantBadge: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
  },
  participantCount: { fontSize: 12, color: COLORS.textSecondary },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  emptyText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  exploreBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 100,
    marginTop: 8,
  },
  exploreBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
