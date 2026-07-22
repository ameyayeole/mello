import { useMemo, useRef, useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Clipboard,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useEventChat } from '@/hooks/useEventChat';
import { useReactions } from '@/hooks/useReactions';
import { useActiveChat } from '@/hooks/useActiveChat';
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
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Message, Profile } from '@/types/models';
import { formatChatTime, startsNewDay } from '@/utils/time';
import { readersByMessage, runFlags } from '@/utils/messageGroups';
import {
  CategoryTile,
  Glass,
  Icon,
  IconButton,
  NavButton,
  PressableScale,
} from '@/components/ui';
import {
  SosButton,
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
  DayDivider,
  ReadReceiptSheet,
  PinnedMessageBanner,
  MentionAutocomplete,
  Mentionable,
  Ticks,
  TickStatus,
  activeMentionQuery,
  insertMention,
} from '@/components/chat';
import ProfileBottomSheet, {
  ProfileBottomSheetRef,
} from '@/components/profile/ProfileBottomSheet';
import {
  messageExcerpt,
  pickChatImage,
  promptReportMessage,
} from '@/utils/chatActions';
import { showError } from '@/utils/errors';

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
    <Animated.View entering={FadeInDown.duration(250)}>
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

export default function GroupChatScreen() {
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
  const [input, setInput] = useState('');
  const [announceMode, setAnnounceMode] = useState(false);
  const [messageSheet, setMessageSheet] = useState<Message | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const listRef = useRef<FlatList>(null);
  const profileSheet = useRef<ProfileBottomSheetRef>(null);

  // Full event detail: header info, host, participants (mentions + host
  // controls), chat lock + pinned message (migration 030 columns).
  const { data: event } = useQuery({
    queryKey: ['eventChatDetail', eventId],
    queryFn: () => getEventDetail(eventId),
    enabled: !!eventId,
  });

  const prefsQuery = useQuery({
    queryKey: queryKeys.chatPrefs.of(user?.id),
    queryFn: () => getChatPrefs(user!.id),
    enabled: !!user,
  });
  const pref = prefsQuery.data?.get(chatKey('event', eventId));

  const { messages, reads, send, sendImage, retry, remove } = useEventChat(
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

  function refreshDetail() {
    qc.invalidateQueries({ queryKey: ['eventChatDetail', eventId] });
  }

  function handleSend() {
    const text = input.trim();
    if (!text || !user) return;
    setInput('');
    send(user.id, text, announceMode ? 'announcement' : 'text');
    if (announceMode) setAnnounceMode(false);
  }

  async function handleAttach() {
    if (!user) return;
    const uri = await pickChatImage();
    if (uri) sendImage(user.id, uri);
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
      <StatusBar style="dark" />
      <Glass
        tier="chrome"
        radius={0}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <NavButton
          onPress={() => router.navigate('/(tabs)/chats')}
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
        <SosButton
          event={event ?? null}
          onReport={
            event ? () => router.push(`/friends/${event.host_id}`) : undefined
          }
        />
      </Glass>

      {/* Post-event: nudge the wrap from the chat */}
      {event && hasWrapped(event) && (
        <PressableScale
          scaleTo={0.98}
          style={styles.wrapBanner}
          onPress={() => router.push(`/events/wrap/${event.id}`)}
          accessibilityRole="button"
          accessibilityLabel="Open the event wrap"
        >
          <Text style={styles.wrapBannerEmoji}>📸</Text>
          <Text style={styles.wrapBannerText}>
            This one's a wrap. Rate people, drop photos, vote awards.
          </Text>
          <Icon name="chevronRight" size={16} color={COLORS.primary} />
        </PressableScale>
      )}

      {pinnedMessage && (
        <PinnedMessageBanner
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
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item, index }) => {
            const isMine = item.sender_id === user?.id;
            const read = isMine && readByAll(item);
            const longPress = () => {
              if (!item._status) setMessageSheet(item);
            };
            const divider = startsNewDay(
              messages[index - 1]?.created_at,
              item.created_at
            ) ? (
              <DayDivider date={item.created_at} />
            ) : null;

            if (item.type === 'system')
              return (
                <>
                  {divider}
                  <SystemRow content={item.content} />
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

            const { isFirstOfRun, isLastOfRun } = runFlags(
              messages[index - 1],
              item,
              messages[index + 1]
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
                // One timestamp per run, on its last message — four messages
                // in the same minute stamped four times is noise.
                showMeta={isLastOfRun}
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
                onAvatarPress={() => profileSheet.current?.open(item.sender_id)}
              />
              </>
            );
          }}
          contentContainerStyle={styles.messageList}
          style={styles.flex}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
        />

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
              onPress={handleAttach}
              accessibilityLabel="Send a photo"
            >
              <Icon name="image" size={20} color={COLORS.textSecondary} />
            </PressableScale>
            <TextInput
              style={styles.input}
              placeholder={announceMode ? 'Announcement…' : 'Message…'}
              placeholderTextColor="rgba(15,24,44,0.40)"
              value={input}
              onChangeText={setInput}
              multiline
              autoCapitalize="none"
            />
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
      <ProfileBottomSheet ref={profileSheet} />
    </View>
  );
}

const styles = StyleSheet.create({
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
  messageList: { padding: SPACING[4], gap: SPACING[2.5], flexGrow: 1 },
  systemRow: { alignItems: 'center', marginVertical: SPACING[1] },
  systemText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: 'rgba(15,24,44,0.4)',
    backgroundColor: 'rgba(15,24,44,0.06)',
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
    color: 'rgba(15,24,44,0.35)',
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
    borderTopColor: 'rgba(15,24,44,0.08)',
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
  wrapBannerEmoji: { fontSize: TYPE_SIZE.body },
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
});
