import { useEffect, useMemo, useRef, useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, {
  FadeOut,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useEventChat } from '@/hooks/useEventChat';
import { useReactions } from '@/hooks/useReactions';
import { useActiveChat } from '@/hooks/useActiveChat';
import { useBackToInbox } from '@/hooks/useBackToInbox';
import { useChatScroll } from '@/hooks/useChatScroll';
import { useMessagePolls } from '@/hooks/useMessagePolls';
import { useAuthStore } from '@/stores/authStore';
import {
  getEventDetail,
  removeParticipant,
} from '@/services/events.service';
import {
  getMessageById,
  pinEventMessage,
  setChatLocked,
} from '@/services/chat.service';
import { getChatPrefs, setChatMuted, chatKey } from '@/services/chatPrefs.service';
import { hasWrapped } from '@/services/wrap.service';
import { COLORS, inkAlpha } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Message, Profile, ReplyTarget } from '@/types/models';
import { formatChatTime } from '@/utils/time';
import {
  readersByMessage,
  runFlags,
  startsTimeBlock,
} from '@/utils/messageGroups';
import {
  CategoryTile,
  Glass,
  Icon,
  IconButton,
  NavButton,
  PressableScale,
  SkeletonGroup,
} from '@/components/ui';
import {
  MoneyGuardBanner,
  useMoneyGuard,
} from '@/components/safety';
import {
  OptionSheet,
  SheetOption,
  MentionText,
  MessageBubble,
  ReactionOverlay,
  BubbleAnchor,
  TimeDivider,
  TIME_GUTTER,
  ReadReceiptSheet,
  PinnedMessageBanner,
  MentionAutocomplete,
  Mentionable,
  PollBubble,
  PollComposer,
  ReplyComposerBar,
  Ticks,
  TickStatus,
  activeMentionQuery,
  insertMention,
} from '@/components/chat';
import { WrapSheet } from '@/components/wrap/WrapSheet';
import {
  messageExcerpt,
  pickChatImage,
  promptReportMessage,
  replyTargetOf,
} from '@/utils/chatActions';
import { showError } from '@/utils/errors';
import { themedStyles } from '@/theme';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { SkeletonBubble } from '@/components/skeletons';

// How much of a pull past the gutter actually moves the thread, and the spring
// that returns it. Slightly overdamped: it should settle, not wobble — this is
// a peek at the time, not a toy.
const RUBBER = 0.5;
const SPRING_BACK = { damping: 20, stiffness: 220, mass: 0.5 };

function tickStatus(message: Message, read: boolean): TickStatus {
  if (message._status === 'sending') return 'sending';
  return read ? 'read' : 'sent';
}

// System notices and host announcements are full-width cards rather than
// bubbles, so they stay here — the shared <MessageBubble> renders the other
// two types, in both this screen and the DM thread.
function SystemRow({ content }: { content: string }) {
  return (
    <View style={styles.systemRow}>
      <Text style={styles.systemText}>{content}</Text>
    </View>
  );
}

function AnnouncementCard({
  message,
  isMine,
  read,
  mentionables,
  onLongPress,
}: {
  message: Message;
  isMine: boolean;
  read: boolean;
  mentionables?: Map<string, string>;
  onLongPress?: (message: Message) => void;
}) {
  const sending = message._status === 'sending';

  return (
    // FadeInUp, not FadeInDown, and for the same reason MessageBubble takes an
    // `inverted` prop: this card sits in an inverted list cell, whose `scaleY: -1`
    // flips the direction of the 25pt offset these presets animate from.
    // FadeInDown starts *below* and rises — which, flipped, drops in from above.
    <Animated.View entering={FadeInUp.duration(250)}>
      <PressableScale
        scaleTo={0.99}
        style={[styles.announceCard, sending && { opacity: 0.6 }]}
        onLongPress={() => onLongPress?.(message)}
        delayLongPress={350}
      >
        <View style={styles.announceHead}>
          <Icon name="megaphone" size={15} color="#B4690E" />
          <Text style={styles.announceLabel}>
            Announcement · {message.sender?.name ?? 'Host'}
          </Text>
        </View>
        <MentionText
          content={message.content}
          style={styles.announceText}
          mentionables={mentionables}
        />
        <View style={styles.announceMetaRow}>
          <Text style={styles.announceTime}>
            {formatChatTime(message.created_at)}
          </Text>
          {isMine && <Ticks status={tickStatus(message, read)} />}
        </View>
      </PressableScale>
    </Animated.View>
  );
}

/**
 * The route. `[eventId]` is `dangerouslySingular` (see chats/_layout), so opening
 * a different event chat reuses *this* route with new params rather than pushing
 * a second one — and a param change on a kept route does not remount. The key
 * makes it remount: without it the incoming thread renders with the previous
 * one's messages, scroll position, unread anchor and "already seen" set still in
 * state, because all of those live in `useState`/`useRef` below.
 */
export default function GroupChatRoute() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  return <GroupChatScreen key={eventId} />;
}

function GroupChatScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // The tab bar hides on a conversation, so the composer sits on the screen
  // edge and owes the home indicator its own inset — but only with the
  // keyboard down, or it opens a gap above the keys.
  const composerInset = useKeyboardVisible() ? 0 : insets.bottom;
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  useActiveChat(eventId ? `event:${eventId}` : null);
  const backToInbox = useBackToInbox();
  const [input, setInput] = useState('');
  const [announceMode, setAnnounceMode] = useState(false);
  const [messageSheet, setMessageSheet] = useState<Message | null>(null);
  // What the composer is replying to, until it sends or you cancel. The snapshot
  // rather than the message: it is what gets stored on the reply, and holding the
  // whole row would keep a deleted message alive in state.
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [attachVisible, setAttachVisible] = useState(false);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // Tapping someone's photo opens their profile, the whole page — not the
  // summary sheet this used to raise. In a group chat the person is usually a
  // stranger, and the question being asked is "who is this", which is exactly
  // what the page answers and the sheet only previews.
  //
  // Dismiss first: on Android the keyboard survives a push and ends up sitting
  // over the profile.
  function openProfile(userId: string) {
    Keyboard.dismiss();
    router.push(`/friends/${userId}`);
  }

  // Full event detail: header info, host, participants (mentions + host
  // controls), chat lock + pinned message (migration 030 columns).
  // The shared `eventDetail` key, not a private `['eventChatDetail', id]` one.
  //
  // Same function, same shape — a bespoke key just meant this screen could
  // never reuse what the card or host panel had already fetched, and refetched
  // from scratch on every entry. That cost is not evenly spread: `getEventDetail`
  // selects the participant roster with a full profile per row, and RLS shows a
  // HOST every row of their own event where it shows a guest almost none. So the
  // events whose chats were slowest to open were exactly the ones you host, and
  // they paid it again every time you came back to the thread.
  //
  // `staleTime` for the same reason: navigating back into a thread you were just
  // in should read the cache, not re-run the roster query while the transition
  // is trying to animate.
  const { data: event } = useQuery({
    queryKey: queryKeys.eventDetail.of(eventId),
    queryFn: () => getEventDetail(eventId),
    enabled: !!eventId,
    staleTime: 60_000,
  });

  // The wrap, met from the chat. Once the event has ended, opening its chat
  // presents the post-event sheet first — rate people, drop photos, vote the
  // awards — with a way through to the thread. Auto-opens once per visit (the
  // ref guards against the event query resolving twice); the banner below
  // reopens it after you've viewed the chat.
  const [wrapSheetOpen, setWrapSheetOpen] = useState(false);
  const wrapAutoShown = useRef(false);
  useEffect(() => {
    if (wrapAutoShown.current || !event || !hasWrapped(event)) return;
    wrapAutoShown.current = true;
    setWrapSheetOpen(true);
  }, [event]);

  const prefsQuery = useQuery({
    queryKey: queryKeys.chatPrefs.of(user?.id),
    queryFn: () => getChatPrefs(user!.id),
    enabled: !!user,
  });
  const pref = prefsQuery.data?.get(chatKey('event', eventId));

  const {
    messages,
    reads,
    send,
    sendImage,
    retry,
    remove,
    sendPoll,
    loading: messagesLoading,
  } = useEventChat(
    eventId,
    pref?.cleared_at ?? null
  );

  // Tapbacks. Optimistic rows have client-minted ids the server has never seen,
  // so they are kept out of the id list — a reaction on a message that might
  // not exist yet has nothing to attach to.
  const reactableIds = useMemo(
    () => messages.filter((m) => !m._status).map((m) => m.id),
    [messages]
  );
  const { byMessage: reactions, toggle: react } = useReactions(
    'event',
    eventId,
    reactableIds
  );
  // The message whose tapback bar is open, and where its bubble sits on
  // screen. Held together because the overlay needs both and they are only
  // ever set at the same moment.
  const [reacting, setReacting] = useState<{
    id: string;
    content: string;
    isMine: boolean;
    anchor: BubbleAnchor;
  } | null>(null);

  // The send button's own kick: a small dip and a spring back as the message
  // leaves, so the button and the bubble read as one event rather than as a
  // press followed by a bubble. 8%, not the 16% it started at — this fires on
  // every message, and at 16 it was the loudest thing on the screen.
  const sendKick = useSharedValue(0);
  const sendStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - sendKick.value * 0.08 }],
  }));
  const kickSend = () => {
    sendKick.value = withSequence(
      withTiming(1, { duration: 70 }),
      withSpring(0, { damping: 14, stiffness: 300, mass: 0.4 })
    );
  };

  // Which messages have already been on screen. An entering animation fires on
  // every mount, and a FlatList remounts rows as you scroll — so without this,
  // scrolling back up replays the arrival of everything you already read.
  //
  // Filled in an effect rather than during render: the render that first shows
  // a message must see it as new, and the commit right after is what marks it
  // seen. Ids are never removed; a deleted message cannot arrive again.
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const m of messages) seen.current.add(m.id);
  }, [messages]);

  // Polls in this thread, and their live counts. Does nothing at all in a thread
  // with no polls, which is most of them.
  const { polls, vote } = useMessagePolls(eventId, messages);

  const chatScroll = useChatScroll(listRef, messages);

  // Drag the thread left to read the times. One shared value for every bubble,
  // so the column moves as a single sheet.
  //
  // `activeOffsetX` / `failOffsetY` are what keep this from stealing the
  // list's vertical scroll: the gesture only takes over once the finger has
  // committed sideways, and gives up the moment it commits downward.
  const revealX = useSharedValue(0);
  const revealPan = Gesture.Pan()
    // Leftward only. A single negative threshold rather than a range: rightward
    // drags belong to the per-message swipe-to-reply (see MessageBubble), and
    // with a range this claimed those too and then ignored them, which is why a
    // right swipe used to do nothing at all.
    .activeOffsetX(-14)
    .failOffsetY([-12, 12])
    // Driven off the gesture's own total translation rather than accumulated
    // deltas. Accumulating and then clamping puts a kink in the motion at the
    // moment resistance starts; computing the whole offset each frame keeps
    // the curve continuous, which is what makes it feel like rubber rather
    // than like something hitting a wall.
    .onUpdate((e) => {
      const raw = Math.min(0, e.translationX);
      const past = -raw - TIME_GUTTER;
      revealX.value =
        past <= 0
          ? raw
          : // Asymptotic: every further pixel of pull moves it less than the
            // last, so it never quite reaches the end and never stops dead.
            -(TIME_GUTTER + (past * RUBBER) / (1 + past / TIME_GUTTER));
    })
    .onEnd((e) => {
      // The release velocity carries into the spring instead of being thrown
      // away — a flick and a slow let-go should not return at the same speed.
      // That handoff is most of what separates "animated" from "physical".
      revealX.value = withSpring(0, { ...SPRING_BACK, velocity: e.velocityX });
    });

  const isHost = !!user && event?.host_id === user.id;
  const locked = !!event?.chat_locked;

  // Everyone in the chat (host + approved participants), for @mentions.
  const mentionPeople: Mentionable[] = useMemo(() => {
    if (!event) return [];
    const people = [
      ...(event.host ? [event.host] : []),
      ...(event.participants ?? []).filter((p: any) => p.status === 'approved'),
    ];
    const seen = new Set<string>();
    return people
      .filter((p) => p.username && p.id !== user?.id && !seen.has(p.id) && seen.add(p.id) !== undefined)
      .map((p) => ({
        id: p.id,
        username: p.username!,
        name: p.name,
        photo_url: p.photo_url,
      }));
  }, [event, user?.id]);

  const mentionables = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of mentionPeople) map.set(p.username.toLowerCase(), p.id);
    // Include yourself so your own @mentions render highlighted too.
    if (user?.username) map.set(user.username.toLowerCase(), user.id);
    return map;
  }, [mentionPeople, user?.username, user?.id]);

  const mentionQuery = activeMentionQuery(input);

  // Everyone else in the chat: who must have read a message for it to show ✓✓
  // (WhatsApp group rule), and who the read rail and its sheet draw faces for.
  const otherMembers = useMemo(() => {
    if (!event || !user) return [] as Profile[];
    const people = [
      ...(event.host ? [event.host] : []),
      ...(event.participants ?? []).filter(
        (p: any) => p.status === 'approved'
      ),
    ];
    const seen = new Set<string>();
    return people.filter((p) => {
      if (!p || p.id === user.id || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    }) as Profile[];
  }, [event, user]);

  // Ids, not `otherMembers.map(...)`: the host's *profile* comes from a join
  // that can come back empty, and dropping them from this list would flip a
  // message to ✓✓ one member early. Faces can be missing; the tick can't be
  // wrong.
  const otherMemberIds = useMemo(() => {
    if (!event || !user) return [];
    const ids = new Set<string>();
    if (event.host_id !== user.id) ids.add(event.host_id);
    for (const p of event.participants ?? []) {
      if ((p as any).status === 'approved' && p.id !== user.id) ids.add(p.id);
    }
    return [...ids];
  }, [event, user]);

  const readByAll = (m: Message) =>
    otherMemberIds.length > 0 &&
    otherMemberIds.every((id) => {
      const t = reads.get(id);
      return !!t && t >= m.created_at;
    });

  // Which of your messages each person's face sits under. `reads` is already
  // live — the watermark table is on this chat's realtime channel — so a face
  // slides down the thread as the other side scrolls.
  const readRail = useMemo(
    () => readersByMessage(messages, reads, user?.id),
    [messages, reads, user?.id]
  );

  const memberById = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const p of otherMembers) map.set(p.id, p);
    return map;
  }, [otherMembers]);

  const readersOf = (messageId: string): Profile[] =>
    (readRail.get(messageId) ?? [])
      .map((id) => memberById.get(id))
      .filter((p): p is Profile => !!p);

  // The message whose "who's seen this" sheet is open.
  const [receiptFor, setReceiptFor] = useState<Message | null>(null);
  const receiptReaders = receiptFor
    ? readersOf(receiptFor.id).map((profile) => ({
        profile,
        readAt: reads.get(profile.id),
      }))
    : [];
  const receiptOthers = receiptFor
    ? otherMembers.filter(
        (p) => !receiptReaders.some((r) => r.profile.id === p.id)
      )
    : [];

  // Pinned message banner content.
  const { data: pinnedMessage } = useQuery({
    queryKey: ['pinnedMessage', event?.pinned_message_id],
    queryFn: () => getMessageById(event!.pinned_message_id!),
    enabled: !!event?.pinned_message_id,
  });

  // Scam guard (#11): warn the recipient when a message looks like a money
  // request, once per conversation per day.
  const moneyGuard = useMoneyGuard(eventId, messages, user?.id);

  // Must match the key the query above actually uses. This is the failure mode
  // a hand-typed key has: it type-checks, it lints, and it silently refreshes
  // nothing (AGENTS.md's "a hand-typed key that drifts fails silently").
  function refreshDetail() {
    qc.invalidateQueries({ queryKey: queryKeys.eventDetail.of(eventId) });
  }

  function handleSend() {
    const text = input.trim();
    if (!text || !user) return;
    kickSend();
    setInput('');
    send(user.id, text, announceMode ? 'announcement' : 'text', replyTo);
    setReplyTo(null);
    // The one place a scroll is still wanted: sending from up in the history
    // should bring you back to your own message.
    chatScroll.scrollToLatest();
    if (announceMode) setAnnounceMode(false);
  }

  // Swiped right on a message. Also what the sheet's Reply row calls.
  //
  // Focuses the composer as well: a reply you have to tap into is a reply you
  // half-started, and every other chat app puts the cursor in the box for you.
  function startReply(message: Message) {
    setReplyTo(replyTargetOf(message, user?.id));
    inputRef.current?.focus();
  }



  async function handleAttach() {
    if (!user) return;
    const uri = await pickChatImage();
    if (uri) sendImage(user.id, uri);
  }

  // The composer's `+` now has two things behind it, so it opens a menu rather
  // than going straight to the photo picker. `OptionSheet` is the same list the
  // long-press menu uses — two entry points, one shape.
  function attachOptions(): SheetOption[] {
    return [
      {
        icon: 'image',
        label: 'Photo',
        onPress: handleAttach,
      },
      {
        icon: 'poll',
        label: 'Poll',
        sub: 'Ask the group to pick',
        onPress: () => setPollComposerOpen(true),
      },
    ];
  }

  function reportMessage(message: Message) {
    if (!user) return;
    promptReportMessage({
      reporterId: user.id,
      offenderId: message.sender_id,
      context: `Chat message ${message.id} in event ${eventId}: "${messageExcerpt(message)}"`,
    });
  }

  function kickParticipant(message: Message) {
    const name = message.sender?.name ?? 'this person';
    Alert.alert(
      'Remove from event',
      `Remove ${name} from the event and this chat?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeParticipant(eventId, message.sender_id);
              refreshDetail();
            } catch (e) {
              showError(e);
            }
          },
        },
      ]
    );
  }

  function messageOptions(message: Message): SheetOption[] {
    if (!user) return [];
    const mine = message.sender_id === user.id;
    const options: SheetOption[] = [];

    // First, because it is the most common thing to want. The swipe is the fast
    // path; this is the discoverable one.
    if (!message._status) {
      options.push({
        icon: 'reply',
        label: 'Reply',
        sub: 'Or swipe the message right',
        onPress: () => startReply(message),
      });
    }
    if (message.type !== 'image') {
      options.push({
        icon: 'copy',
        label: 'Copy',
        onPress: () => Clipboard.setString(message.content),
      });
    }
    if (isHost && !message._status) {
      options.push({
        icon: 'pin',
        label: 'Pin message',
        sub: 'Shown at the top of this chat',
        onPress: async () => {
          try {
            await pinEventMessage(eventId, message.id);
            refreshDetail();
          } catch (e) {
            showError(e);
          }
        },
      });
    }
    if (!mine) {
      options.push({
        icon: 'flag',
        label: 'Report',
        danger: true,
        onPress: () => reportMessage(message),
      });
    }
    if (isHost && !mine) {
      options.push({
        icon: 'block',
        label: 'Remove from event',
        sub: 'Host control',
        danger: true,
        onPress: () => kickParticipant(message),
      });
    }
    if (mine || isHost) {
      options.push({
        icon: 'trash',
        label: mine ? 'Delete message' : 'Delete message (host)',
        danger: true,
        onPress: () => remove(message.id),
      });
    }
    return options;
  }

  function chatMenuOptions(): SheetOption[] {
    if (!user) return [];
    const muted = !!pref?.muted;
    const options: SheetOption[] = [
      {
        icon: muted ? 'bell' : 'bellOff',
        label: muted ? 'Unmute notifications' : 'Mute notifications',
        sub: muted ? undefined : "You'll still get announcements and @mentions",
        onPress: async () => {
          try {
            await setChatMuted(user.id, 'event', eventId, !muted);
            qc.invalidateQueries({ queryKey: queryKeys.chatPrefs.of(user.id) });
          } catch (e) {
            showError(e);
          }
        },
      },
    ];
    if (isHost) {
      options.push(
        {
          icon: 'megaphone',
          label: 'Send announcement',
          sub: 'Pinned + notifies everyone, even muted chats',
          onPress: () => setAnnounceMode(true),
        },
        {
          icon: 'lock',
          label: locked ? 'Unlock chat' : 'Lock chat',
          sub: locked
            ? 'Let everyone send messages again'
            : 'Only you can send messages',
          onPress: async () => {
            try {
              await setChatLocked(eventId, !locked);
              refreshDetail();
            } catch (e) {
              showError(e);
            }
          },
        }
      );
    }
    return options;
  }

  const pinnedByHost = isHost;

  return (
    <View style={styles.container}>
      <ThemedStatusBar />
      <Glass
        tier="chrome"
        radius={0}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <NavButton
          // Back should *pop* — slide this screen off to the right, the way it
          // came in. `router.navigate('/(tabs)/chats')` re-navigated to the list
          // as if it were a new destination, so the transition ran forwards (in
          // from the left) — the "wrong side". That navigate survives inside
          // `useSoleConversation` as the deep-link fallback only.
          onPress={backToInbox}
          accessibilityLabel="Go back"
        />
        {event?.activity ? (
          <CategoryTile activity={event.activity} size={38} radius={11} />
        ) : null}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {event?.title ?? 'Event chat'}
          </Text>
          <Text style={styles.headerSub}>
            {locked ? 'Host-only mode' : 'Group chat'}
          </Text>
        </View>
        <IconButton
          icon="dots"
          variant="ghost"
          onPress={() => setMenuVisible(true)}
          accessibilityLabel="Chat options"
        />
      </Glass>

      {/* Post-event: reopen the wrap sheet from the chat, once it's been
          dismissed. Opens the sheet now rather than pushing the full hub — the
          sheet is the chat's own front door to the wrap, and carries a link on
          through to the hub. */}
      {event && hasWrapped(event) && (
        <PressableScale
          scaleTo={0.98}
          style={styles.wrapBanner}
          onPress={() => setWrapSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open the event wrap"
        >
          <Icon name="camera" size={18} color={COLORS.primary} />
          <Text style={styles.wrapBannerText}>
            This one&apos;s a wrap. Rate people, drop photos, vote awards.
          </Text>
          <Icon name="chevronRight" size={16} color={COLORS.primary} />
        </PressableScale>
      )}

      {pinnedMessage && (
        <PinnedMessageBanner
          // The same jump a reply's quote makes. `scrollToMessage` no-ops when
          // the message is not in the loaded page, so the prop is only handed
          // over when there is somewhere to go — otherwise the bar would be a
          // button that does nothing.
          onPress={
            messages.some((m) => m.id === pinnedMessage.id)
              ? () => chatScroll.scrollToMessage(pinnedMessage.id)
              : undefined
          }
          senderName={pinnedMessage.sender?.name}
          content={pinnedMessage.content}
          isImage={pinnedMessage.type === 'image'}
          isAnnouncement={pinnedMessage.type === 'announcement'}
          onUnpin={
            pinnedByHost
              ? async () => {
                  try {
                    await pinEventMessage(eventId, null);
                    refreshDetail();
                  } catch (e) {
                    showError(e);
                  }
                }
              : undefined
          }
        />
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {messagesLoading ? (
          // A thread with no loading state showed an empty room and then filled
          // it. The bones sit bottom-up, like the inverted list they stand in for.
          <Animated.View style={styles.flex} exiting={FadeOut.duration(150)}>
            <SkeletonGroup>
              <SkeletonBubble />
            </SkeletonGroup>
          </Animated.View>
        ) : (
        <GestureDetector gesture={revealPan}>
        <FlatList
          ref={listRef}
          // Inverted: index 0 is the newest message and offset 0 is the bottom,
          // so the thread opens at the last message with no scrolling — see
          // useChatScroll. `data` is the reversed view of `messages`, which stays
          // oldest-first everywhere else.
          inverted
          data={chatScroll.ordered}
          keyExtractor={(m) => m.id}
          renderItem={({ item, index }) => {
            // Neighbours in *reading* order, from an array that is in the
            // opposite one. Everything below (runs, time blocks) is written in
            // terms of what came before and after a message, and inverting the
            // list must not quietly invert that too.
            const older = chatScroll.ordered[index + 1];
            const newer = chatScroll.ordered[index - 1];
            const isMine = item.sender_id === user?.id;
            const read = isMine && readByAll(item);
            const longPress = () => {
              if (!item._status) setMessageSheet(item);
            };
            const { isFirstOfRun, isLastOfRun } = runFlags(older, item, newer);
            // Only where the conversation actually paused — an hour, or a new
            // day. A header over every burst was a clock stapled to the thread
            // rather than a marker in it.
            const divider = startsTimeBlock(older, item) ? (
              <TimeDivider date={item.created_at} />
            ) : null;

            if (item.type === 'system')
              return (
                <>
                  {divider}
                  <SystemRow content={item.content} />
                </>
              );

            // A poll is addressed to the room, so it renders full width like a
            // system notice or an announcement rather than as one person's
            // bubble. Its question lives on `content`, which is also what every
            // preview of it shows — the Inbox row, a reply quote, the pinned bar.
            if (item.type === 'poll')
              return (
                <>
                  {divider}
                  <PollBubble
                    question={item.content}
                    poll={polls?.get(item.id)}
                    onVote={(optionId) => vote(item.id, optionId)}
                    senderName={item.sender?.name}
                    showName={!isMine}
                  />
                </>
              );

            if (item.type === 'announcement')
              return (
                <>
                  {divider}
                  <AnnouncementCard
                    message={item}
                    isMine={isMine}
                    read={read}
                    mentionables={mentionables}
                    onLongPress={longPress}
                  />
                </>
              );

            return (
              <>
              {divider}
              <MessageBubble
                content={item.content}
                type={item.type === 'image' ? 'image' : 'text'}
                createdAt={item.created_at}
                isMine={isMine}
                status={item._status}
                sender={
                  item.sender
                    ? {
                        id: item.sender_id,
                        name: item.sender.name,
                        photoUrl: item.sender.photo_url,
                      }
                    : { id: item.sender_id }
                }
                showAvatar={isLastOfRun}
                isFirstOfRun={isFirstOfRun}
                revealX={revealX}
                isNew={!seen.current.has(item.id)}
                showName={isFirstOfRun}
                tick={isMine ? tickStatus(item, read) : undefined}
                mentionables={mentionables}
                reactions={reactions.get(item.id)}
                myUserId={user?.id}
                onOpenReactions={
                  item._status
                    ? undefined
                    : (anchor) =>
                        setReacting({
                          id: item.id,
                          content: item.content,
                          isMine,
                          anchor,
                        })
                }
                readers={isMine ? readersOf(item.id) : undefined}
                onReadersPress={() => setReceiptFor(item)}
                onRetry={() => retry(item)}
                onLongPress={longPress}
                onAvatarPress={() => openProfile(item.sender_id)}
                reply={
                  item.reply_to_id
                    ? {
                        senderName: item.reply_sender_name ?? 'Message',
                        preview: item.reply_preview ?? '',
                      }
                    : null
                }
                onQuotePress={
                  item.reply_to_id
                    ? () => chatScroll.scrollToMessage(item.reply_to_id!)
                    : undefined
                }
                // Not on a message still in flight: it has no server row for a
                // reply to point at, and its id would be orphaned if the send
                // failed.
                onReply={item._status ? undefined : () => startReply(item)}
                // The list is inverted, which flips the direction of the send
                // entrance unless the bubble knows.
                inverted
              />
              </>
            );
          }}
          contentContainerStyle={styles.messageList}
          style={styles.flex}
          onScrollToIndexFailed={chatScroll.onScrollToIndexFailed}
          // Windowing, because this list is what the tab transition is waiting
          // on. Opening a chat from another tab mounts the thread while the
          // `shift` animation is running, and that animation is driven from the
          // JS thread — so an unwindowed list rendering the whole page at once
          // (50 messages, each computing run flags, read receipts and time
          // dividers) held the thread long enough for the transition to stall
          // half-way, leaving the tab you came from painted through this one.
          //
          // A screenful first, the rest in small batches after. The numbers are
          // a screenful-and-a-bit rather than a round guess: a bubble is ~60pt,
          // so 12 covers the tallest phone with room to spare.
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={9}
          // Drag the thread and the keyboard goes away, the way it does in
          // WhatsApp and Instagram.
          //
          // `on-drag` on both platforms, not iOS's nicer `interactive`, because
          // `inverted` flips it: interactive dismissal follows a drag toward the
          // keyboard, and the list's scaleY(-1) maps a real downward drag onto an
          // upward one internally — so the keyboard came down when you swiped
          // *up* into history and stayed put when you swiped down at it.
          keyboardDismissMode="on-drag"
          // …but a tap on a bubble, a mention or a reply quote still lands
          // instead of being swallowed by the dismiss.
          keyboardShouldPersistTaps="handled"
          // Frees the offscreen rows' native views while keeping them mounted —
          // the memory half of the same problem on a long thread. iOS only:
          // combined with `inverted`, Android's clipping is the long-standing
          // source of rows that scroll into view blank, and a blank message is
          // worse than the memory it saves.
          removeClippedSubviews={Platform.OS === 'ios'}
        />
        </GestureDetector>
        )}

        <MoneyGuardBanner
          visible={moneyGuard.visible}
          onDismiss={moneyGuard.dismiss}
          onReport={() => {
            moneyGuard.dismiss();
            if (moneyGuard.flaggedSenderId)
              router.push(`/friends/${moneyGuard.flaggedSenderId}`);
          }}
        />

        {mentionQuery !== null && (
          <MentionAutocomplete
            query={mentionQuery}
            people={mentionPeople}
            onPick={(username) => setInput((prev) => insertMention(prev, username))}
          />
        )}

        {replyTo && (
          <ReplyComposerBar reply={replyTo} onCancel={() => setReplyTo(null)} />
        )}

        {announceMode && (
          <View style={styles.announceModeBar}>
            <Icon name="megaphone" size={14} color="#B4690E" />
            <Text style={styles.announceModeText}>
              Announcement mode — everyone gets notified
            </Text>
            <PressableScale
              scaleTo={0.85}
              onPress={() => setAnnounceMode(false)}
              accessibilityLabel="Cancel announcement"
            >
              <Icon name="close" size={14} color="#B4690E" />
            </PressableScale>
          </View>
        )}

        {locked && !isHost ? (
          <View
            style={[
              styles.lockedBar,
              { paddingBottom: composerInset + SPACING[4] },
            ]}
          >
            <Icon name="lock" size={15} color={COLORS.textSecondary} />
            <Text style={styles.lockedText}>
              Only the host can send messages right now
            </Text>
          </View>
        ) : (
          <Glass
            tier="chrome"
            radius={0}
            style={[
              styles.inputBar,
              announceMode && styles.inputBarAnnounce,
              { paddingBottom: composerInset + SPACING[2.5] },
            ]}
          >
            <PressableScale
              scaleTo={0.85}
              style={styles.attachBtn}
              onPress={() => setAttachVisible(true)}
              accessibilityLabel="Attach a photo or a poll"
            >
              <Icon name="plus" size={22} color={COLORS.textSecondary} />
            </PressableScale>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={announceMode ? 'Announcement…' : 'Message…'}
              placeholderTextColor={inkAlpha(0.40)}
              value={input}
              onChangeText={setInput}
              multiline
              autoCapitalize="none"
            />
            {/* The kick lives on a wrapper: PressableScale owns its own
                press-scale, and two animated transforms on one node fight. */}
            <Animated.View style={sendStyle}>
            <PressableScale
              scaleTo={0.85}
              style={[
                styles.sendBtn,
                announceMode && styles.sendBtnAnnounce,
                !input.trim() && styles.sendBtnDisabled,
              ]}
              onPress={handleSend}
              disabled={!input.trim()}
              accessibilityLabel="Send message"
            >
              <Icon
                name={announceMode ? 'megaphone' : 'send'}
                size={19}
                color="#fff"
                strokeWidth={2}
              />
            </PressableScale>
            </Animated.View>
          </Glass>
        )}
      </KeyboardAvoidingView>

      <OptionSheet
        visible={!!messageSheet}
        title={
          messageSheet?.sender?.name
            ? `Message · ${messageSheet.sender.name}`
            : 'Message'
        }
        options={messageSheet ? messageOptions(messageSheet) : []}
        onClose={() => setMessageSheet(null)}
      />
      <OptionSheet
        visible={attachVisible}
        title="Add to the chat"
        options={attachOptions()}
        onClose={() => setAttachVisible(false)}
      />
      <PollComposer
        visible={pollComposerOpen}
        onClose={() => setPollComposerOpen(false)}
        onCreate={(question, options) => {
          setPollComposerOpen(false);
          if (user) sendPoll(user.id, question, options);
        }}
      />
      <OptionSheet
        visible={menuVisible}
        title={event?.title ?? 'Chat options'}
        options={chatMenuOptions()}
        onClose={() => setMenuVisible(false)}
      />
      <ReadReceiptSheet
        visible={!!receiptFor}
        readers={receiptReaders}
        others={receiptOthers}
        onClose={() => setReceiptFor(null)}
      />
      {/* Tapping a face in the thread. A sheet rather than the profile route:
          you are checking who said this, not leaving the conversation. */}
      <ReactionOverlay
        visible={!!reacting}
        anchor={reacting?.anchor ?? null}
        content={reacting?.content ?? ''}
        isMine={!!reacting?.isMine}
        myEmoji={
          reacting
            ? reactions
                .get(reacting.id)
                ?.find((r) => r.user_id === user?.id)?.emoji
            : undefined
        }
        onPick={(emoji) => {
          if (reacting) react(reacting.id, emoji);
          setReacting(null);
        }}
        onClose={() => setReacting(null)}
      />
      {event && hasWrapped(event) && (
        <WrapSheet
          visible={wrapSheetOpen}
          onClose={() => setWrapSheetOpen(false)}
          event={event}
        />
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  // Transparent — the thread runs over the app's drifting background now, the
  // same as the Inbox it came from.
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    paddingHorizontal: SPACING[4],
    paddingBottom: SPACING[3],
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.bodyLg,
    letterSpacing: -0.2,
    color: COLORS.textPrimary,
  },
  headerSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
    marginTop: SPACING[0.5],
  },
  // No `gap`: the rows space themselves. A gap here is added to every row's
  // own margin, so the 2pt inside a burst was really 12 — which is what made
  // the tightening look like it had done nothing.
  messageList: { padding: SPACING[4], flexGrow: 1 },
  systemRow: { alignItems: 'center', marginVertical: SPACING[1] },
  systemText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: inkAlpha(0.4),
    backgroundColor: inkAlpha(0.06),
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  announceCard: {
    backgroundColor: '#FFF6E9',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(180,105,14,0.25)',
    paddingHorizontal: SPACING[3.5],
    paddingVertical: SPACING[2.5],
  },
  announceHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  announceLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: '#B4690E',
  },
  announceText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textPrimary,
    marginTop: SPACING[1.5],
  },
  announceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    alignSelf: 'flex-end',
    marginTop: SPACING[1],
  },
  announceTime: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.nano,
    color: inkAlpha(0.35),
  },
  announceModeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[1.5],
    backgroundColor: '#FFF6E9',
    borderTopWidth: 1,
    borderTopColor: 'rgba(180,105,14,0.2)',
  },
  announceModeText: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: '#B4690E',
  },
  lockedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[3.5],
    paddingVertical: SPACING[4],
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: inkAlpha(0.08),
  },
  wrapBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    marginHorizontal: SPACING[3.5],
    marginBottom: SPACING[1.5],
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2.5],
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryTint,
    borderWidth: 1,
    borderColor: 'rgba(255,94,91,0.25)',
  },
  wrapBannerText: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textPrimary,
  },
  lockedText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  inputBar: {
    flexDirection: 'row',
    // flex-end so the send button stays pinned to the bottom of a grown input.
    alignItems: 'flex-end',
    gap: SPACING[2],
    paddingHorizontal: SPACING[3.5],
    paddingTop: SPACING[2.5],
    // The bar was reading as part of the wallpaper — glass over a pale
    // background is a pale background. The hairline is what says the thread
    // ends here and the controls begin.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  inputBarAnnounce: { backgroundColor: '#FFF6E9' },
  attachBtn: {
    width: 38,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    // Grows with the message instead of scrolling a single line sideways,
    // matching the DM screen.
    minHeight: 44,
    maxHeight: 120,
    // Solid, not glass: a translucent field inside a translucent bar is two
    // sheets of the same thing, and the input stopped looking like somewhere
    // you could type.
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2.5],
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  // Ink, matching the mockup and the outgoing bubbles. Send is the thing you
  // do here constantly; coral is for the decisions.
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnAnnounce: { backgroundColor: '#E8940A' },
  sendBtnDisabled: { backgroundColor: COLORS.disabled },
}));
