import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RADIUS, SHADOWS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, {
  Easing,
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import {
  getAttendeePreviews,
  getJoinedEvents,
  getMyEvents,
} from '@/services/events.service';
import {
  getFriendConversations,
  getUnreadDmCounts,
} from '@/services/dm.service';
import { getLastMessages } from '@/services/chat.service';
import {
  getChatPrefs,
  setChatPinned,
  setChatMuted,
  clearChat,
  chatKey,
} from '@/services/chatPrefs.service';
import { COLORS } from '@/constants/colors';
import { ACTIVITY_MAP } from '@/constants/activities';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import {
  NearbyEvent,
  FriendConversation,
  ChatPref,
  WrapNote,
} from '@/types/models';
import { formatChatTime } from '@/utils/time';
import {
  Avatar,
  CategoryTile,
  EmptyState,
  Glass,
  Icon,
  OverflowCount,
  PressableScale,
  SectionLabel,
  useTabBarInset,
} from '@/components/ui';
import {
  useHandedOver,
  useOpenOverlay,
  useOverlayRecede,
} from '@/hooks/useOverlayScreen';
import { usePresence } from '@/hooks/usePresence';
import { useFriends } from '@/hooks/useFriends';
import { useExploreFeed } from '@/hooks/useExploreFeed';
import { OptionSheet, SheetOption } from '@/components/chat';
import { useWrapNotes } from '@/hooks/useWrapNotes';
import {
  SealedNoteRow,
  NoteRevealModal,
} from '@/components/wrap/SealedNoteRow';
import { showError } from '@/utils/errors';

type Tab = 'events' | 'friends';

// What the long-press sheet needs to know about the pressed conversation.
interface SheetTarget {
  chatType: 'event' | 'dm';
  chatId: string;
  title: string;
  pref?: ChatPref;
}

// What a row shows for a message that isn't text. A word, not an emoji: the
// thumbnail beside it is already carrying the picture, and a 📷 in the preview
// line reads as part of what the person actually said.
function previewText(content: string, type: string): string {
  if (type === 'image') return 'Photo';
  if (type === 'announcement') return `Announcement: ${content}`;
  return content;
}

// What a chat with nothing said in it yet reads as. "You're hosting" rather
// than your own name back at you — the row is addressed to you.
function hostingLine(event: NearbyEvent, myUserId?: string): string {
  if (event.host_id === myUserId) return "You're hosting this event";
  return `${event.host_name ?? 'The host'} is hosting this event`;
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

// A conversation row. Instagram's content, exactly — who it is, the latest
// message, when. Nothing else. It used to carry the event's date and
// going-count as well, which meant the one line you actually read was competing
// with two you don't.
//
// The row no longer frosts itself: every row now sits on one shared glass sheet
// (see the list body), divided by a hairline rather than by a gap between
// separate cards. So a row is a plain pressable band with a top divider — the
// first row on the sheet drops it, since there is nothing above it to divide
// from.
//
// `layout` is what makes a re-sort *move*: when a new message lifts a chat to
// the top, its row and the ones it passes glide to their new places instead of
// snapping. Entering still fires once on mount (and on a tab switch, which
// remounts the rows). Both ride the same Animated.View; that's safe because the
// view carries no `style` of its own — Reanimated only warns about a layout
// animation clobbering styles when they share the very component the animation
// is attached to, and here the styles live one level down on the row `View`.
//
// Unread is weight, not decoration: bold ink for the message and the time,
// regular grey once read.
function ChatRow({
  index,
  first,
  thumb,
  title,
  preview,
  time,
  unread,
  pref,
  onPress,
  onLongPress,
}: {
  index: number;
  first: boolean;
  thumb: React.ReactNode;
  title: string;
  // "Ana: see you there" in a group, just the message in a DM.
  preview: string;
  time?: string;
  unread?: number;
  pref?: ChatPref;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(320)}
      layout={LinearTransition.springify().damping(20).stiffness(180).mass(0.7)}
    >
      <PressableScale
        scaleTo={0.98}
        onPress={onPress}
        onLongPress={onLongPress}
      >
        <View style={styles.row}>
          {/* The separator, inset to start where the text does rather than
              running the full width under the thumbnail — the edge-to-edge line
              read as the sheet being sliced into strips. Not on the first row:
              nothing above it to divide from. */}
          {!first ? <View style={styles.rowDivider} /> : null}
          {thumb}
          <View style={styles.rowInfo}>
            <View style={styles.rowTitleRow}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {title}
              </Text>
              <PrefGlyphs pref={pref} />
              {time ? (
                <Text
                  style={[styles.rowTime, !!unread && styles.rowTimeUnread]}
                >
                  {time}
                </Text>
              ) : null}
            </View>
            <View style={styles.rowPreviewRow}>
              <Text
                style={[styles.rowSub, !!unread && styles.rowSubUnread]}
                numberOfLines={1}
              >
                {preview}
              </Text>
              {unread ? (
                <View style={styles.unreadPill}>
                  <Text style={styles.unreadText}>{unread}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

// An event's thumbnail: its own photo, with the category in the little disc on
// the corner. The photo says *which* event, the disc says what kind — the tile
// alone said only the kind, and three house parties looked identical.
//
// No photo falls back to the category tile, same as EventRow: `photo` is a
// request, not a guarantee.
function EventThumb({ event }: { event: NearbyEvent }) {
  return (
    <View>
      {event.image_url ? (
        <Image
          source={{ uri: event.image_url }}
          style={styles.eventPhoto}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <CategoryTile activity={event.activity} size={52} radius={16} />
      )}
      {/* Smoked glass with a white ring — and it frosts *itself* rather than
          blurring what is behind it.

          `backdrop` exists for this (DESIGN.md §3). A backdrop blur is a
          `UIVisualEffectView`, which does not reliably respect a parent's
          corner mask — at this size that leaves a square corner poking out
          from behind a round one, which is the clipping that survived two
          attempts to fix it. Compositing our own blurred copy of the photo is
          plain Views end to end, so it cannot fail to clip. It also renders
          identically on Android, where there is no backdrop blur at all.

          No photo means nothing to frost, so the disc falls back to flat ink —
          still the backdrop path, still guaranteed to clip. */}
      <Glass
        tier="onPhoto"
        radius={12}
        shadow={false}
        style={styles.typeBadge}
        backdrop={
          event.image_url ? (
            <Image
              source={{ uri: event.image_url }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              blurRadius={28}
            />
          ) : (
            <View style={styles.typeBadgeFallback} />
          )
        }
      >
        <Text style={styles.typeEmoji}>
          {ACTIVITY_MAP[event.activity]?.emoji ?? '📍'}
        </Text>
      </Glass>
    </View>
  );
}

export default function ChatsListScreen() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const [tab, setTab] = useState<Tab>('events');

  const openOverlay = useOpenOverlay();
  const handedOver = useHandedOver();
  const recedeStyle = useOverlayRecede();
  const searchRef = useRef<View>(null);

  // Keep the list honest whenever it comes back into view. It orders by the
  // most-recent message and prints each chat's latest line, but the queries
  // behind both — last-message-per-event and the friend conversations — never
  // refetch on their own while this tab sits mounted behind an open chat. So
  // after you send or receive in a thread, the list kept its old order and old
  // preview until a cold reload. Refetching on focus is what makes the chat you
  // just spoke in actually rise to the top (and animate there, via the row
  // layout transition) instead of staying put.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      qc.invalidateQueries({ queryKey: ['lastMessages'] });
      qc.invalidateQueries({ queryKey: ['friendConversations', user.id] });
      qc.invalidateQueries({ queryKey: queryKeys.unreadDmCounts.of(user.id) });
    }, [qc, user])
  );

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

  const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null);
  const [revealedNote, setRevealedNote] = useState<WrapNote | null>(null);

  // Post-event notes land here, above the DM threads.
  const {
    sealed: sealedNotes,
    opened: openedNotes,
    open: openNote,
  } = useWrapNotes();

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

  // Unread badges on the DM rows. Event chats have no equivalent: unread there
  // means comparing every message against a per-event read watermark, which is
  // a query per event until an RPC exists. Under-counting beats guessing.
  const unreadQuery = useQuery({
    queryKey: queryKeys.unreadDmCounts.of(user?.id),
    queryFn: () => getUnreadDmCounts(user!.id),
    enabled: !!user,
  });
  const unreadByFriend = unreadQuery.data;

  // "Active now": friends with the app open, off the presence channel the
  // Friends screen already runs. Nobody there is the common case in a young
  // app, so the row falls back to events worth opening instead — boosted
  // first, then whatever is nearby.
  const { isOnline } = usePresence();
  const { friends } = useFriends();
  const activeFriends = useMemo(
    () =>
      friends
        .map((f) => f.friend)
        .filter((p): p is NonNullable<typeof p> => !!p && isOnline(p.id)),
    [friends, isOnline]
  );

  const boostedFeed = useExploreFeed(true, activeFriends.length === 0);
  const nearbyFeed = useExploreFeed(false, activeFriends.length === 0);
  const promoted = useMemo(() => {
    const boosted = boostedFeed.data?.pages.flat() ?? [];
    const nearby = nearbyFeed.data?.pages.flat() ?? [];
    return (boosted.length > 0 ? boosted : nearby).slice(0, 3);
  }, [boostedFeed.data, nearbyFeed.data]);

  // Faces for the promoted tiles. The feed's own participant_count includes
  // pending requests; this RPC is approved-only and carries the people, which
  // is what a stack needs — see migration 038.
  const promotedIds = useMemo(() => promoted.map((e) => e.id), [promoted]);
  const previewsQuery = useQuery({
    queryKey: queryKeys.attendeePreviews.of(promotedIds),
    queryFn: () => getAttendeePreviews(promotedIds),
    enabled: promotedIds.length > 0,
  });
  const previews = previewsQuery.data;

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
    queryKey: ['lastMessages', eventIds.join(',')],
    queryFn: () => getLastMessages(eventIds),
    enabled: eventIds.length > 0,
  });
  const lastMessages = lastMsgQuery.data;

  const eventChats = useMemo(() => {
    let list = allEventChats;
    if (prefs) {
      list = list.filter((e) => {
        const pref = prefs.get(chatKey('event', e.id));
        if (!pref?.cleared_at) return true;
        const last = lastMessages?.get(e.id)?.created_at;
        return !!last && last > pref.cleared_at;
      });
    }
    // Pinned first, then most-recent-message first. This is the order the list
    // is meant to be in and wasn't — before, equal-pin rows kept whatever order
    // the two queries happened to concatenate in, so a chat that just got a
    // message could sit anywhere. Empty chats (no last message) fall to the
    // bottom. Sorting always runs, pinned or not; the pin lookup is just null
    // when there are no prefs yet.
    list = [...list].sort((a, b) => {
      const pa = prefs?.get(chatKey('event', a.id))?.pinned_at;
      const pb = prefs?.get(chatKey('event', b.id))?.pinned_at;
      if (!!pa !== !!pb) return pa ? -1 : 1;
      if (pa && pb) return pb.localeCompare(pa);
      const ta = lastMessages?.get(a.id)?.created_at ?? '';
      const tb = lastMessages?.get(b.id)?.created_at ?? '';
      return tb.localeCompare(ta);
    });
    return list;
  }, [allEventChats, prefs, lastMessages]);

  const conversations = useMemo(() => {
    let list = conversationsQuery.data ?? [];
    if (prefs) {
      list = list.filter((c) => {
        const pref = prefs.get(chatKey('dm', c.friend.id));
        if (!pref?.cleared_at) return true;
        return !!c.lastMessage && c.lastMessage.created_at > pref.cleared_at;
      });
    }
    // Pinned first, then most-recent-message first — see eventChats above.
    list = [...list].sort((a, b) => {
      const pa = prefs?.get(chatKey('dm', a.friend.id))?.pinned_at;
      const pb = prefs?.get(chatKey('dm', b.friend.id))?.pinned_at;
      if (!!pa !== !!pb) return pa ? -1 : 1;
      if (pa && pb) return pb.localeCompare(pa);
      const ta = a.lastMessage?.created_at ?? '';
      const tb = b.lastMessage?.created_at ?? '';
      return tb.localeCompare(ta);
    });
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
            await setChatPinned(
              user.id,
              target.chatType,
              target.chatId,
              !pinned
            );
            refreshPrefs();
          } catch (e) {
            showError(e);
          }
        },
      },
      {
        icon: muted ? 'bell' : 'bellOff',
        label: muted ? 'Unmute notifications' : 'Mute notifications',
        sub: muted ? undefined : "You'll still get announcements and @mentions",
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

  const items: (NearbyEvent | FriendConversation)[] =
    tab === 'events' ? eventChats : conversations;

  const renderEventRow = (event: NearbyEvent, index: number) => {
    const last = lastMessages?.get(event.id);
    return (
      <ChatRow
        key={`event:${event.id}`}
        index={index}
        first={index === 0}
        thumb={<EventThumb event={event} />}
        title={event.title}
        // Who said it, then what they said — a group chat's preview is useless
        // without the name in front of it. Except for a system notice, which
        // already names the person it is about: "Iris: Iris joined the event".
        preview={
          last
            ? `${last.senderName && last.type !== 'system' ? `${last.senderName}: ` : ''}${previewText(last.content, last.type)}`
            : // Migration 042 posts this into the chat itself, so events created
              // from now on carry it as a real message. Derived here for every
              // event made before that trigger existed, which would otherwise
              // read as an empty chat forever.
              hostingLine(event, user?.id)
        }
        time={last ? formatChatTime(last.created_at) : undefined}
        pref={prefs?.get(chatKey('event', event.id))}
        onPress={() => router.push(`/(tabs)/chats/${event.id}`)}
        onLongPress={() =>
          setSheetTarget({
            chatType: 'event',
            chatId: event.id,
            title: event.title,
            pref: prefs?.get(chatKey('event', event.id)),
          })
        }
      />
    );
  };

  const renderFriendRow = (convo: FriendConversation, index: number) => {
    const { friend, lastMessage } = convo;
    return (
      <ChatRow
        key={`dm:${friend.id}`}
        index={index}
        first={index === 0}
        thumb={
          <Avatar
            name={friend.name}
            photoUrl={friend.photo_url}
            size={52}
            online={isOnline(friend.id)}
          />
        }
        title={friend.name}
        preview={
          lastMessage
            ? previewText(lastMessage.content, lastMessage.type)
            : 'Tap to start chatting'
        }
        time={lastMessage ? formatChatTime(lastMessage.created_at) : undefined}
        unread={unreadByFriend?.get(friend.id)}
        pref={prefs?.get(chatKey('dm', friend.id))}
        onPress={() => router.push(`/(tabs)/chats/dm/${friend.id}`)}
        onLongPress={() =>
          setSheetTarget({
            chatType: 'dm',
            chatId: friend.id,
            title: friend.name,
            pref: prefs?.get(chatKey('dm', friend.id)),
          })
        }
      />
    );
  };

  // Everything above the conversations, scrolling with them: the field, the
  // title, who's around, and the switcher.
  const header = (
    <View style={styles.header}>
      {/* Title first, then the field. The page's own name has to lead, or the
          section labels below read as headings for a screen that never named
          itself. */}
      <Text style={styles.title}>Messages</Text>

      {/* The field that flies up into the search overlay. The plain wrapping
          View is what gets measured — see useOpenOverlay for why the ref
          cannot go on the PressableScale, and why it needs collapsable. */}
      <View
        ref={searchRef}
        collapsable={false}
        style={handedOver === 'chatSearch' && styles.handedOver}
      >
        <PressableScale
          scaleTo={0.98}
          onPress={() => openOverlay('chatSearch', searchRef)}
          accessibilityRole="search"
          accessibilityLabel="Search events and people"
        >
          <Glass tier="panel" radius={RADIUS.lg} style={styles.searchBar}>
            <Icon name="search" size={18} color={COLORS.textMuted} />
            <Text style={styles.searchText}>Search events & people</Text>
          </Glass>
        </PressableScale>
      </View>

      {activeFriends.length > 0 ? (
        <View style={styles.block}>
          <SectionLabel>Active now</SectionLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.activeScroll}
            contentContainerStyle={styles.activeRow}
          >
            <PressableScale
              scaleTo={0.92}
              onPress={() => router.push('/friends')}
              accessibilityRole="button"
              accessibilityLabel="Find friends"
            >
              <View style={styles.activeItem}>
                <View style={styles.addTile}>
                  <Icon name="plus" size={22} color={COLORS.textPrimary} />
                </View>
                <Text style={styles.activeName}>Add</Text>
              </View>
            </PressableScale>
            {activeFriends.map((friend) => (
              <View key={friend.id} style={styles.activeItem}>
                <Avatar
                  name={friend.name}
                  photoUrl={friend.photo_url}
                  size={72}
                  online
                  onPress={() => router.push(`/(tabs)/chats/dm/${friend.id}`)}
                />
                <Text style={styles.activeName} numberOfLines={1}>
                  {friend.name.split(' ')[0]}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : promoted.length > 0 ? (
        // Nobody's around. The rail keeps its shape and fills with what there
        // is to turn up to instead — boosted first, then nearby. Same tiles,
        // same rhythm; swapping in full-width rows here made the top of the
        // page lurch every time a friend went offline.
        <View style={styles.block}>
          <SectionLabel>Happening near you</SectionLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.activeScroll}
            contentContainerStyle={styles.activeRow}
          >
            {/* Always first, whatever is in the rail: the way to put your own
                event in it. Creation lives on the map — there is no standalone
                form — so this arms the flow and hops there, the same as the
                FAB does from explore. */}
            <PressableScale
              scaleTo={0.92}
              onPress={() => {
                useUIStore.getState().setCreatingEvent(true);
                router.push('/(tabs)/map');
              }}
              accessibilityRole="button"
              accessibilityLabel="Host your own event"
            >
              <View style={styles.activeItem}>
                <View style={styles.hostTile}>
                  <Icon name="plus" size={26} color={COLORS.white} />
                </View>
                <Text style={styles.activeName} numberOfLines={1}>
                  Host
                </Text>
              </View>
            </PressableScale>
            {promoted.map((event) => (
              <PressableScale
                key={event.id}
                scaleTo={0.92}
                onPress={() => {
                  useUIStore.getState().setSelectedEvent(event.id);
                  router.push('/(tabs)/explore');
                }}
                accessibilityRole="button"
                accessibilityLabel={`Open ${event.title}`}
              >
                <View style={styles.activeItem}>
                  <View>
                    {event.image_url ? (
                      <Image
                        source={{ uri: event.image_url }}
                        style={styles.promotedPhoto}
                        contentFit="cover"
                        transition={150}
                      />
                    ) : (
                      <CategoryTile
                        activity={event.activity}
                        size={72}
                        radius={36}
                      />
                    )}
                    {/* How many are going, on the corner. A count, not faces —
                        at this size the faces were unrecognisable, which is
                        the whole point of a stack, and the number is the thing
                        you actually want off a stranger's event. */}
                    <OverflowCount
                      count={
                        previews?.[event.id]?.going_count ??
                        event.participant_count ??
                        0
                      }
                      size={26}
                      ringColor={COLORS.white}
                      ringWidth={2}
                      style={styles.goingChip}
                    />
                  </View>
                  <Text style={styles.activeName} numberOfLines={1}>
                    {event.title}
                  </Text>
                </View>
              </PressableScale>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Post-event notes, above the DM threads they belong with. */}
      {tab === 'friends' &&
      (sealedNotes.length > 0 || openedNotes.length > 0) ? (
        <View style={styles.block}>
          <SectionLabel>Notes</SectionLabel>
          {sealedNotes.map((n) => (
            <SealedNoteRow key={n.id} note={n} onOpen={handleOpenNote} />
          ))}
          {openedNotes.slice(0, 3).map((n) => (
            <SealedNoteRow key={n.id} note={n} onOpen={handleOpenNote} />
          ))}
        </View>
      ) : null}

      {/* The switcher stands in for the mockup's "CHATS" label — it names the
          section and picks it at the same time, and both would be saying the
          same word twice. */}
      <Glass
        tier="panel"
        radius={RADIUS.full}
        style={styles.segment}
        onLayout={onSegmentLayout}
      >
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
      </Glass>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Steps back while the search overlay is up. On the list rather than
          the whole screen: the option sheet must not shrink with it. */}
      <Animated.View style={[styles.flex, recedeStyle]}>
        {/* A ScrollView, not a FlatList, for two reasons that arrived together.
            The conversations sit on one continuous frosted sheet now (divided
            by hairlines, not gaps), which a virtualised list can't paint as a
            single surface. And a FlatList reset scroll to the top on every tab
            switch — because the tab is in each row's key, the whole list
            remounted and the list snapped up mid-scroll. A ScrollView keeps its
            offset across that remount, so switching tabs no longer yanks you to
            the top. Chat counts here are in the dozens, not the thousands, so
            the virtualisation we give up costs nothing. */}
        <ScrollView
          contentContainerStyle={[
            styles.listBody,
            { paddingTop: insets.top + SPACING[3], paddingBottom: tabBarInset },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {header}
          {items.length === 0 ? (
            tab === 'events' ? (
              <EmptyState
                icon="chat"
                title="No event chats yet"
                body="Join or create an event to start chatting with people going."
                actionLabel="Explore map"
                onAction={() => router.push('/(tabs)/map')}
              />
            ) : (
              <EmptyState
                icon="userPlus"
                title="No friends yet"
                body="Add friends to start direct conversations."
                actionLabel="Find friends"
                onAction={() => router.push('/friends')}
              />
            )
          ) : (
            // One frosted sheet under all the rows, instead of a frosted card
            // per chat. `edge` stays 'all': the sheet is a finite thing that
            // begins and ends, unlike the header chrome that runs off-screen.
            <Glass tier="panel" radius={RADIUS['2xl']} style={styles.sheet}>
              {tab === 'events'
                ? (items as NearbyEvent[]).map((item, index) =>
                    renderEventRow(item, index)
                  )
                : (items as FriendConversation[]).map((item, index) =>
                    renderFriendRow(item, index)
                  )}
            </Glass>
          )}
        </ScrollView>
      </Animated.View>

      <OptionSheet
        visible={!!sheetTarget}
        title={sheetTarget?.title}
        options={sheetTarget ? sheetOptions(sheetTarget) : []}
        onClose={() => setSheetTarget(null)}
      />

      <NoteRevealModal
        note={revealedNote}
        onClose={() => setRevealedNote(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Transparent: what shows through is the <AppBackground> mounted once behind
  // the tab navigator. This tab used to be the one opaque white list in the
  // app — see DESIGN.md §7, which this reverses.
  container: { flex: 1 },
  flex: { flex: 1 },
  listBody: { paddingHorizontal: SPACING[5], gap: SPACING[4] },
  // The one frosted sheet the conversations sit on. Its own corners are all it
  // rounds — the rows inside are square bands divided by hairlines.
  sheet: { overflow: 'hidden' },
  // The field the overlay is flying. Hidden outright, not faded — two copies
  // of one object mid-transition is what a hand-off must never look like.
  handedOver: { opacity: 0 },
  searchBar: {
    height: 54,
    paddingHorizontal: SPACING[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
  },
  searchText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textMuted,
  },
  header: { gap: SPACING[4], paddingBottom: SPACING[1] },
  title: {
    // `h1`, the app's screen-title step — not `display`. Leading the page now
    // rather than sitting under the field, 34 shouted over the section labels
    // beneath it; 28 reads as the same system they belong to.
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.h1,
    lineHeight: 32,
    letterSpacing: -0.8,
    color: COLORS.textPrimary,
    marginBottom: -SPACING[1.5],
  },
  block: { gap: SPACING[2.5] },

  // Runs to both screen edges: the rail should look like it continues past the
  // screen, not like a list that stops short of it. The negative margin
  // cancels the list's own padding; the content puts it back as scroll inset.
  activeScroll: { marginHorizontal: -SPACING[5] },
  activeRow: { gap: SPACING[3.5], paddingHorizontal: SPACING[5] },
  // 72, up from 60 — the rail is the second thing on the page and was reading
  // as a footnote to the title above it.
  activeItem: { alignItems: 'center', gap: SPACING[1.5], width: 76 },
  addTile: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.inkSubtle,
    // Not <Glass>: a dashed border needs the fill without the blur, and this
    // is the "there could be someone here" placeholder, not a surface.
    backgroundColor: COLORS.glassPanel,
  },
  // The one solid tile in the rail. Ink, because it is an action among a row
  // of things that merely exist — and the app's coral is spoken for.
  hostTile: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    ...SHADOWS.primary,
  },
  activeName: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  promoted: { gap: SPACING[2.5] },

  // Frosted like everything else on this page — it used to be a flat ink wash,
  // which was the one surface here not on the glass system.
  segment: {
    flexDirection: 'row',
    padding: SPACING[1],
  },
  segmentPill: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    ...SHADOWS.sm,
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
    color: COLORS.textMuted,
  },
  segmentTextActive: { color: COLORS.textPrimary },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2.5],
  },
  // The line between two chats on the shared sheet. Absolutely positioned along
  // the row's top edge and inset from the left by the thumbnail column
  // (row padding + 52pt thumb + gap), so it aligns under the text like a
  // standard chat list — not edge-to-edge. `border` (10% black, the app's
  // separator ink) at a firm hairline actually reads on the frosted panel,
  // where `inkSubtle` (7%) at a single hairline had vanished.
  rowDivider: {
    position: 'absolute',
    top: 0,
    left: SPACING[3] + 52 + SPACING[3],
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: COLORS.border,
  },
  rowInfo: { flex: 1, minWidth: 0, gap: SPACING[0.5] },
  rowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
  },
  rowPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
  },
  glyphRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1] },
  rowTitle: {
    flex: 1,
    fontFamily: FONTS.headingBold,
    fontSize: TYPE_SIZE.bodyLg,
    letterSpacing: -0.2,
    color: COLORS.textPrimary,
  },
  rowSub: {
    flex: 1,
    minWidth: 0,
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },
  // An unread conversation states its case in ink, not grey.
  rowSubUnread: { fontFamily: FONTS.bold, color: COLORS.textPrimary },
  rowTime: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
  },
  rowTimeUnread: { color: COLORS.primary },
  eventPhoto: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.inkFaint,
  },
  // What kind of event, on the corner of its photo. The ring is what holds it
  // off the image behind it; without one the disc's edge lands wherever the
  // photo happens to be dark and disappears wherever it doesn't.
  typeBadge: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    // No fill of its own — <Glass> paints the pane inside this box, so the
    // border here becomes the ring around it.
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  // Nothing to frost when the event has no photo.
  typeBadgeFallback: { flex: 1, backgroundColor: COLORS.accent },
  // Glyph metrics, not typography: an emoji's own box sits well inside its
  // font size, so 10 fills roughly half the disc — which is the proportion the
  // reference draws.
  typeEmoji: { fontSize: 10, lineHeight: 13 },
  promotedPhoto: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.inkFaint,
  },
  // Position only — OverflowCount owns the disc's colour, shape and type.
  goingChip: { position: 'absolute', top: -2, right: -4 },
  unreadPill: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: SPACING[1.5],
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  unreadText: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.white,
  },
});
