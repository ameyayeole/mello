import { useEffect, useMemo, useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  LayoutChangeEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, {
  Easing,
  FadeInDown,
  SlideInLeft,
  SlideInRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import {
  NearbyEvent,
  FriendConversation,
  ChatPref,
  WrapNote,
} from '@/types/models';
import { formatEventTime, formatChatTime } from '@/utils/time';
import {
  Avatar,
  CategoryTile,
  EmptyState,
  Icon,
  PressableScale,
  useTabBarInset,
} from '@/components/ui';
import { OptionSheet, SheetOption } from '@/components/chat';
import { useWrapNotes } from '@/hooks/useWrapNotes';
import { SealedNoteRow, NoteRevealModal } from '@/components/wrap/SealedNoteRow';
import { showError } from '@/utils/errors';

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

export default function ChatsListScreen() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const [tab, setTab] = useState<Tab>('events');

  // Sliding pill behind the active segment. Width comes from the measured
  // track (half of it, minus the 4pt inset on each side).
  const tabIndex = tab === 'events' ? 0 : 1;
  const [pillW, setPillW] = useState(0);
  const slide = useSharedValue(0);

  function onSegmentLayout(e: LayoutChangeEvent) {
    setPillW((e.nativeEvent.layout.width - 8) / 2);
  }

  useEffect(() => {
    slide.value = withTiming(tabIndex, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [tabIndex, slide]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value * pillW }],
  }));

  // The list slides in from whichever side the new tab sits on.
  const contentEnter = (tabIndex === 1 ? SlideInRight : SlideInLeft)
    .duration(260)
    .easing(Easing.out(Easing.cubic));
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
    queryKey: queryKeys.joinedEvents.of(user?.id),
    queryFn: () => getJoinedEvents(user!.id),
    enabled: !!user,
  });

  const myEventsQuery = useQuery({
    queryKey: queryKeys.myEvents.of(user?.id),
    queryFn: () => getMyEvents(user!.id),
    enabled: !!user,
  });

  const conversationsQuery = useQuery({
    queryKey: ['friendConversations', user?.id],
    queryFn: () => getFriendConversations(user!.id),
    enabled: !!user,
  });

  const prefsQuery = useQuery({
    queryKey: queryKeys.chatPrefs.of(user?.id),
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
    qc.invalidateQueries({ queryKey: queryKeys.chatPrefs.of(user?.id) });
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
          } catch (e) {
            showError(e);
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
          } catch (e) {
            showError(e);
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
                  } catch (e) {
                    showError(e);
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
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Dark header — wraps the title and the Events/Direct switcher */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>Inbox</Text>

        {/* Segmented tab switcher with a pill that slides between tabs */}
        <View style={styles.segment} onLayout={onSegmentLayout}>
          {pillW > 0 && (
            <Animated.View
              style={[styles.segmentPill, { width: pillW }, pillStyle]}
            />
          )}
          {(['events', 'friends'] as Tab[]).map((t) => (
            <Pressable
              key={t}
              style={styles.segmentTab}
              onPress={() => setTab(t)}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === t }}
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

      <Animated.View key={tab} entering={contentEnter} style={styles.flex}>
      {tab === 'events' ? (
        eventChats.length === 0 ? (
          <EmptyState
            icon="chat"
            title="No event chats yet"
            body="Join or create an event to start chatting with people going."
            actionLabel="Explore map"
            onAction={() => router.push('/(tabs)/map')}
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
            contentContainerStyle={{ paddingBottom: tabBarInset }}
          />
        )
      ) : conversations.length === 0 &&
        sealedNotes.length === 0 &&
        openedNotes.length === 0 ? (
        <EmptyState
          icon="userPlus"
          title="No friends yet"
          body="Add friends to start direct conversations."
          actionLabel="Find friends"
          onAction={() => router.push('/friends')}
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
          contentContainerStyle={{ paddingBottom: tabBarInset }}
        />
      )}
      </Animated.View>

      <OptionSheet
        visible={!!sheetTarget}
        title={sheetTarget?.title}
        options={sheetTarget ? sheetOptions(sheetTarget) : []}
        onClose={() => setSheetTarget(null)}
      />

      <NoteRevealModal note={revealedNote} onClose={() => setRevealedNote(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  flex: { flex: 1 },
  header: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING[5],
    paddingBottom: SPACING[4],
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.titleLg,
    letterSpacing: -0.5,
    color: '#fff',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: RADIUS.full,
    padding: SPACING[1],
    marginTop: SPACING[3.5],
  },
  segmentPill: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    backgroundColor: '#fff',
    borderRadius: RADIUS.full,
  },
  segmentTab: {
    flex: 1,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
  },
  segmentText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: 'rgba(255,255,255,0.6)',
  },
  segmentTextActive: { color: COLORS.textPrimary },
  separator: {
    height: 1,
    backgroundColor: 'rgba(15,24,44,0.06)',
    marginLeft: 81,
  },
  notesBlock: { paddingHorizontal: SPACING[5], paddingTop: SPACING[0.5] },
  notesLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    letterSpacing: 0.4,
    color: 'rgba(15,24,44,0.45)',
    marginBottom: SPACING[0.5],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingHorizontal: SPACING[5],
    paddingVertical: SPACING[3],
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  glyphRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1] },
  rowTitle: {
    flexShrink: 1,
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  rowSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  rowTime: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: 'rgba(15,24,44,0.4)',
  },
  countPill: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING[2],
    paddingVertical: SPACING[1],
    borderRadius: RADIUS.full,
  },
  countPillText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: 'rgba(15,24,44,0.55)',
  },
});
