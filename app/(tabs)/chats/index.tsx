import { useState } from 'react';
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
import { getJoinedEvents, getMyEvents } from '@/services/events.service';
import { getFriendConversations } from '@/services/dm.service';
import { ACTIVITY_MAP } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { NearbyEvent, FriendConversation } from '@/types/models';
import { formatEventTime, formatChatTime } from '@/utils/time';

type Tab = 'events' | 'friends';

function avatarInitial(name?: string | null) {
  return (name?.trim()?.[0] ?? '?').toUpperCase();
}

function EventChatRow({ event }: { event: NearbyEvent }) {
  const router = useRouter();
  const activity = ACTIVITY_MAP[event.activity];

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/(tabs)/chats/${event.id}`)}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarEmoji}>{activity?.emoji ?? '💬'}</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {event.title}
        </Text>
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

function FriendChatRow({ convo }: { convo: FriendConversation }) {
  const router = useRouter();
  const { friend, lastMessage } = convo;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/(tabs)/chats/dm/${friend.id}`)}
    >
      <View style={[styles.avatar, styles.avatarFriend]}>
        <Text style={styles.avatarInitial}>{avatarInitial(friend.name)}</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {friend.name}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {lastMessage ? lastMessage.content : 'Tap to start chatting'}
        </Text>
      </View>
      {lastMessage && (
        <Text style={styles.rowTime}>
          {formatChatTime(lastMessage.created_at)}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function ChatsListScreen() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('events');

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

  const conversationsQuery = useQuery({
    queryKey: ['friendConversations', user?.id],
    queryFn: () => getFriendConversations(user!.id),
    enabled: !!user,
  });

  const eventChats = [
    ...(myEventsQuery.data ?? []),
    ...(joinedQuery.data ?? []).filter(
      (e) => !myEventsQuery.data?.some((m) => m.id === e.id)
    ),
  ];
  const conversations = conversationsQuery.data ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'events' && styles.tabActive]}
          onPress={() => setTab('events')}
        >
          <Text
            style={[styles.tabText, tab === 'events' && styles.tabTextActive]}
          >
            Events
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'friends' && styles.tabActive]}
          onPress={() => setTab('friends')}
        >
          <Text
            style={[styles.tabText, tab === 'friends' && styles.tabTextActive]}
          >
            Friends
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'events' ? (
        eventChats.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyTitle}>No event chats yet</Text>
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
            data={eventChats}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <EventChatRow event={item} />}
            contentContainerStyle={styles.list}
          />
        )
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🧑‍🤝‍🧑</Text>
          <Text style={styles.emptyTitle}>No friends yet</Text>
          <Text style={styles.emptyText}>
            Add friends to start direct conversations.
          </Text>
          <TouchableOpacity
            style={styles.exploreBtn}
            onPress={() => router.push('/(tabs)/friends')}
          >
            <Text style={styles.exploreBtnText}>Find Friends</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.friend.id}
          renderItem={({ item }) => <FriendChatRow convo={item} />}
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
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 100,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary },
  tabTextActive: { color: '#fff' },
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
  avatarFriend: { backgroundColor: COLORS.primary },
  avatarEmoji: { fontSize: 22 },
  avatarInitial: { color: '#fff', fontSize: 20, fontWeight: '700' },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  rowSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  rowTime: { fontSize: 12, color: COLORS.textMuted },
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
