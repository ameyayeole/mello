import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { getJoinedEvents, getMyEvents } from '@/services/events.service';
import { getFriendConversations } from '@/services/dm.service';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { NearbyEvent, FriendConversation } from '@/types/models';
import { formatEventTime, formatChatTime } from '@/utils/time';
import {
  Avatar,
  Button,
  CategoryTile,
  Icon,
  PressableScale,
} from '@/components/ui';

type Tab = 'events' | 'friends';

function EventChatRow({ event, index }: { event: NearbyEvent; index: number }) {
  const router = useRouter();

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(320)}>
      <PressableScale
        style={styles.row}
        scaleTo={0.98}
        onPress={() => router.push(`/(tabs)/chats/${event.id}`)}
      >
        <CategoryTile activity={event.activity} size={48} radius={14} />
        <View style={styles.rowInfo}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {event.title}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {formatEventTime(event.starts_at)}
          </Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>
            {event.participant_count ?? 0} going
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

function FriendChatRow({
  convo,
  index,
}: {
  convo: FriendConversation;
  index: number;
}) {
  const router = useRouter();
  const { friend, lastMessage } = convo;

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(320)}>
      <PressableScale
        style={styles.row}
        scaleTo={0.98}
        onPress={() => router.push(`/(tabs)/chats/dm/${friend.id}`)}
      >
        <Avatar name={friend.name} photoUrl={friend.photo_url} size={48} />
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
      </PressableScale>
    </Animated.View>
  );
}

function EmptyState({
  icon,
  title,
  text,
  ctaLabel,
  onCta,
}: {
  icon: 'chat' | 'userPlus';
  title: string;
  text: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={38} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
      <Button label={ctaLabel} height={44} onPress={onCta} style={{ marginTop: 8 }} />
    </View>
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
        <Text style={styles.title}>Inbox</Text>
      </View>

      {/* Segmented tab switcher */}
      <View style={styles.segmentWrap}>
        <View style={styles.segment}>
          {(['events', 'friends'] as Tab[]).map((t) => (
            <Pressable
              key={t}
              style={[styles.segmentTab, tab === t && styles.segmentTabActive]}
              onPress={() => setTab(t)}
            >
              <Text
                style={[
                  styles.segmentText,
                  tab === t && styles.segmentTextActive,
                ]}
              >
                {t === 'events' ? 'Events' : 'Direct'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === 'events' ? (
        eventChats.length === 0 ? (
          <EmptyState
            icon="chat"
            title="No event chats yet"
            text="Join or create an event to start chatting with people going."
            ctaLabel="Explore map"
            onCta={() => router.push('/(tabs)/map')}
          />
        ) : (
          <FlatList
            data={eventChats}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <EventChatRow event={item} index={index} />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.list}
          />
        )
      ) : conversations.length === 0 ? (
        <EmptyState
          icon="userPlus"
          title="No friends yet"
          text="Add friends to start direct conversations."
          ctaLabel="Find friends"
          onCta={() => router.push('/friends')}
        />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.friend.id}
          renderItem={({ item, index }) => (
            <FriendChatRow convo={item} index={index} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 24,
    letterSpacing: -0.48,
    color: COLORS.textPrimary,
  },
  segmentWrap: { paddingHorizontal: 20, paddingBottom: 14 },
  segment: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#F0F1F3',
    borderRadius: 100,
    padding: 4,
  },
  segmentTab: {
    flex: 1,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 100,
  },
  segmentTabActive: {
    backgroundColor: COLORS.surface,
    shadowColor: '#0F182C',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: 'rgba(15,24,44,0.5)',
  },
  segmentTextActive: { color: COLORS.textPrimary },
  list: { paddingBottom: 20 },
  separator: {
    height: 1,
    backgroundColor: 'rgba(15,24,44,0.06)',
    marginLeft: 81,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: COLORS.textPrimary,
  },
  rowSub: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  rowTime: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    color: 'rgba(15,24,44,0.4)',
  },
  countPill: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 100,
  },
  countPillText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: 'rgba(15,24,44,0.55)',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 240,
  },
});
