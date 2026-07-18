import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { getJoinedEvents, getMyEvents } from '@/services/events.service';
import { getFriendConversations } from '@/services/dm.service';
import { getLastMessageTimes } from '@/services/chat.service';
import {
  getChatPrefs,
  setChatPinned,
  setChatMuted,
  clearChat,
  chatKey,
} from '@/services/chatPrefs.service';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { NearbyEvent, FriendConversation, ChatPref } from '@/types/models';
import { formatEventTime, formatChatTime } from '@/utils/time';
import {
  Avatar,
  Button,
  CategoryTile,
  Icon,
  PressableScale,
} from '@/components/ui';
import { OptionSheet, SheetOption } from '@/components/chat';
import { useWrapNotes } from '@/hooks/useWrapNotes';
import { SealedNoteRow, NoteRevealModal } from '@/components/wrap/SealedNoteRow';
import { WrapNote } from '@/types/models';

type Tab = 'events' | 'friends';

// What the long-press sheet needs to know about the pressed conversation.
interface SheetTarget {
  chatType: 'event' | 'dm';
  chatId: string;
  title: string;
  pref?: ChatPref;
}

function PrefGlyphs({ pref }: { pref?: ChatPref }) {
  if (!pref) return null;
  return (
    <View style={styles.glyphRow}>
      {pref.pinned_at ? (
        <Icon name="pin" size={13} color={COLORS.primary} />
      ) : null}
      {pref.muted ? (
        <Icon name="bellOff" size={13} color="rgba(15,24,44,0.4)" />
      ) : null}
    </View>
  );
}

function EventChatRow({
  event,
  index,
  pref,
  onLongPress,
}: {
  event: NearbyEvent;
  index: number;
  pref?: ChatPref;
  onLongPress: () => void;
}) {
  const router = useRouter();

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(320)}>
      <PressableScale
        style={styles.row}
        scaleTo={0.98}
        onPress={() => router.push(`/(tabs)/chats/${event.id}`)}
        onLongPress={onLongPress}
      >
        <CategoryTile activity={event.activity} size={48} radius={14} />
        <View style={styles.rowInfo}>
          <View style={styles.rowTitleRow}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {event.title}
            </Text>
            <PrefGlyphs pref={pref} />
          </View>
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
  pref,
  onLongPress,
}: {
  convo: FriendConversation;
  index: number;
  pref?: ChatPref;
  onLongPress: () => void;
}) {
  const router = useRouter();
  const { friend, lastMessage } = convo;

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(320)}>
      <PressableScale
        style={styles.row}
        scaleTo={0.98}
        onPress={() => router.push(`/(tabs)/chats/dm/${friend.id}`)}
        onLongPress={onLongPress}
      >
        <Avatar name={friend.name} photoUrl={friend.photo_url} size={48} />
        <View style={styles.rowInfo}>
          <View style={styles.rowTitleRow}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {friend.name}
            </Text>
            <PrefGlyphs pref={pref} />
          </View>
          <Text style={styles.rowSub} numberOfLines={1}>
            {lastMessage
              ? lastMessage.type === 'image'
                ? '📷 Photo'
                : lastMessage.content
              : 'Tap to start chatting'}
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
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('events');
  const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null);
  const [revealedNote, setRevealedNote] = useState<WrapNote | null>(null);

  // Post-event notes land here, above the DM threads.
  const { sealed: sealedNotes, opened: openedNotes, open: openNote } =
    useWrapNotes();

  function handleOpenNote(note: WrapNote) {
    if (!note.opened_at) openNote.mutate(note.id);
    setRevealedNote(note);
  }

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

  const prefsQuery = useQuery({
    queryKey: ['chatPrefs', user?.id],
    queryFn: () => getChatPrefs(user!.id),
    enabled: !!user,
  });
  const prefs = prefsQuery.data;

  const allEventChats = useMemo(
    () => [
      ...(myEventsQuery.data ?? []),
      ...(joinedQuery.data ?? []).filter(
        (e) => !myEventsQuery.data?.some((m) => m.id === e.id)
      ),
    ],
    [myEventsQuery.data, joinedQuery.data]
  );

  // Last message per event chat, for "deleted chat" hiding (a cleared chat
  // reappears once someone sends a newer message).
  const eventIds = allEventChats.map((e) => e.id);
  const lastMsgQuery = useQuery({
    queryKey: ['lastMessageTimes', eventIds.join(',')],
    queryFn: () => getLastMessageTimes(eventIds),
    enabled: eventIds.length > 0,
  });
  const lastMsgTimes = lastMsgQuery.data;

  const eventChats = useMemo(() => {
    let list = allEventChats;
    if (prefs) {
      list = list.filter((e) => {
        const pref = prefs.get(chatKey('event', e.id));
        if (!pref?.cleared_at) return true;
        const last = lastMsgTimes?.get(e.id);
        return !!last && last > pref.cleared_at;
      });
      list = [...list].sort((a, b) => {
        const pa = prefs.get(chatKey('event', a.id))?.pinned_at;
        const pb = prefs.get(chatKey('event', b.id))?.pinned_at;
        if (!!pa !== !!pb) return pa ? -1 : 1;
        if (pa && pb) return pb.localeCompare(pa);
        return 0;
      });
    }
    return list;
  }, [allEventChats, prefs, lastMsgTimes]);

  const conversations = useMemo(() => {
    let list = conversationsQuery.data ?? [];
    if (prefs) {
      list = list.filter((c) => {
        const pref = prefs.get(chatKey('dm', c.friend.id));
        if (!pref?.cleared_at) return true;
        return (
          !!c.lastMessage && c.lastMessage.created_at > pref.cleared_at
        );
      });
      list = [...list].sort((a, b) => {
        const pa = prefs.get(chatKey('dm', a.friend.id))?.pinned_at;
        const pb = prefs.get(chatKey('dm', b.friend.id))?.pinned_at;
        if (!!pa !== !!pb) return pa ? -1 : 1;
        if (pa && pb) return pb.localeCompare(pa);
        return 0;
      });
    }
    return list;
  }, [conversationsQuery.data, prefs]);

  function refreshPrefs() {
    qc.invalidateQueries({ queryKey: ['chatPrefs', user?.id] });
  }

  function sheetOptions(target: SheetTarget): SheetOption[] {
    if (!user) return [];
    const pinned = !!target.pref?.pinned_at;
    const muted = !!target.pref?.muted;
    return [
      {
        icon: 'pin',
        label: pinned ? 'Unpin chat' : 'Pin chat',
        sub: pinned ? undefined : 'Keep this conversation at the top',
        onPress: async () => {
          try {
            await setChatPinned(user.id, target.chatType, target.chatId, !pinned);
            refreshPrefs();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
      {
        icon: muted ? 'bell' : 'bellOff',
        label: muted ? 'Unmute notifications' : 'Mute notifications',
        sub: muted
          ? undefined
          : "You'll still get announcements and @mentions",
        onPress: async () => {
          try {
            await setChatMuted(user.id, target.chatType, target.chatId, !muted);
            refreshPrefs();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
      {
        icon: 'trash',
        label: 'Delete chat',
        sub: 'Hides it for you — not for others',
        danger: true,
        onPress: () => {
          Alert.alert(
            'Delete chat?',
            `This hides "${target.title}" and its history for you. It comes back if someone sends a new message.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await clearChat(user.id, target.chatType, target.chatId);
                    refreshPrefs();
                  } catch (e: any) {
                    Alert.alert('Error', e.message);
                  }
                },
              },
            ]
          );
        },
      },
    ];
  }

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
              <EventChatRow
                event={item}
                index={index}
                pref={prefs?.get(chatKey('event', item.id))}
                onLongPress={() =>
                  setSheetTarget({
                    chatType: 'event',
                    chatId: item.id,
                    title: item.title,
                    pref: prefs?.get(chatKey('event', item.id)),
                  })
                }
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.list}
          />
        )
      ) : conversations.length === 0 &&
        sealedNotes.length === 0 &&
        openedNotes.length === 0 ? (
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
          ListHeaderComponent={
            sealedNotes.length > 0 || openedNotes.length > 0 ? (
              <View style={styles.notesBlock}>
                <Text style={styles.notesLabel}>NOTES</Text>
                {sealedNotes.map((n) => (
                  <SealedNoteRow key={n.id} note={n} onOpen={handleOpenNote} />
                ))}
                {openedNotes.slice(0, 3).map((n) => (
                  <SealedNoteRow key={n.id} note={n} onOpen={handleOpenNote} />
                ))}
                <View style={styles.separator} />
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <FriendChatRow
              convo={item}
              index={index}
              pref={prefs?.get(chatKey('dm', item.friend.id))}
              onLongPress={() =>
                setSheetTarget({
                  chatType: 'dm',
                  chatId: item.friend.id,
                  title: item.friend.name,
                  pref: prefs?.get(chatKey('dm', item.friend.id)),
                })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
        />
      )}

      <OptionSheet
        visible={!!sheetTarget}
        title={sheetTarget?.title}
        options={sheetTarget ? sheetOptions(sheetTarget) : []}
        onClose={() => setSheetTarget(null)}
      />

      <NoteRevealModal note={revealedNote} onClose={() => setRevealedNote(null)} />
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
  notesBlock: { paddingHorizontal: 20, paddingTop: 2 },
  notesLabel: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    letterSpacing: 0.4,
    color: 'rgba(15,24,44,0.45)',
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  glyphRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowTitle: {
    flexShrink: 1,
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
