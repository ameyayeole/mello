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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useEventChat } from '@/hooks/useEventChat';
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
import { Message } from '@/types/models';
import { formatChatTime } from '@/utils/time';
import {
  Avatar,
  CategoryTile,
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
  ChatImageBubble,
  PinnedMessageBanner,
  MentionAutocomplete,
  Mentionable,
  Ticks,
  TickStatus,
  activeMentionQuery,
  insertMention,
} from '@/components/chat';
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

function MessageBubble({
  message,
  isMine,
  read,
  mentionables,
  onRetry,
  onLongPress,
}: {
  message: Message;
  isMine: boolean;
  // ✓✓: every other chat member has read past this message.
  read: boolean;
  mentionables?: Map<string, string>;
  onRetry?: (message: Message) => void;
  onLongPress?: (message: Message) => void;
}) {
  if (message.type === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

  const failed = message._status === 'failed';
  const sending = message._status === 'sending';

  // Host announcements render as a distinct full-width card.
  if (message.type === 'announcement') {
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

  const isImage = message.type === 'image';

  return (
    <Animated.View
      entering={FadeInDown.duration(250)}
      style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}
    >
      {!isMine && (
        <Avatar
          name={message.sender?.name}
          photoUrl={message.sender?.photo_url}
          size={26}
        />
      )}
      <View style={{ maxWidth: '74%' }}>
        {!isMine && (
          <Text style={styles.senderName}>{message.sender?.name}</Text>
        )}
        {isImage ? (
          <PressableScale
            disabled={false}
            onPress={failed ? () => onRetry?.(message) : undefined}
            onLongPress={() => onLongPress?.(message)}
            delayLongPress={350}
            scaleTo={0.98}
          >
            <ChatImageBubble uri={message.content} dimmed={sending} />
            {failed ? (
              <Text style={styles.imageStatus}>Not sent · tap to retry</Text>
            ) : isMine ? (
              <View style={styles.imageMetaRow}>
                <Text style={styles.imageStatus}>
                  {formatChatTime(message.created_at)}
                </Text>
                <Ticks status={tickStatus(message, read)} />
              </View>
            ) : null}
          </PressableScale>
        ) : (
          <PressableScale
            disabled={false}
            onPress={failed ? () => onRetry?.(message) : undefined}
            onLongPress={() => onLongPress?.(message)}
            delayLongPress={350}
            style={[
              styles.bubble,
              isMine && styles.bubbleMine,
              sending && styles.bubblePending,
            ]}
          >
            <MentionText
              content={message.content}
              style={[styles.bubbleText, isMine && styles.bubbleTextMine]}
              mentionables={mentionables}
              light={isMine}
            />
            <View style={styles.metaRow}>
              <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
                {failed
                  ? 'Not sent · tap to retry'
                  : formatChatTime(message.created_at)}
              </Text>
              {isMine && !failed && (
                <Ticks status={tickStatus(message, read)} light />
              )}
            </View>
          </PressableScale>
        )}
      </View>
    </Animated.View>
  );
}

export default function GroupChatScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  useActiveChat(eventId ? `event:${eventId}` : null);
  const [input, setInput] = useState('');
  const [announceMode, setAnnounceMode] = useState(false);
  const [messageSheet, setMessageSheet] = useState<Message | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const listRef = useRef<FlatList>(null);

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

  // Everyone who must have read a message for it to show ✓✓ (WhatsApp group
  // rule: all other members).
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
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <NavButton
          color={COLORS.white}
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
          color="#fff"
          style={styles.headerBtn}
          onPress={() => setMenuVisible(true)}
          accessibilityLabel="Chat options"
        />
        <SosButton
          event={event ?? null}
          onReport={
            event ? () => router.push(`/friends/${event.host_id}`) : undefined
          }
        />
      </View>

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
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isMine={item.sender_id === user?.id}
              read={item.sender_id === user?.id && readByAll(item)}
              mentionables={mentionables}
              onRetry={retry}
              onLongPress={(m) => {
                if (!m._status) setMessageSheet(m);
              }}
            />
          )}
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
          <View style={styles.lockedBar}>
            <Icon name="lock" size={15} color={COLORS.textSecondary} />
            <Text style={styles.lockedText}>
              Only the host can send messages right now
            </Text>
          </View>
        ) : (
          <View style={[styles.inputBar, announceMode && styles.inputBarAnnounce]}>
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
          </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    paddingHorizontal: SPACING[4],
    paddingBottom: SPACING[3.5],
    backgroundColor: COLORS.accent,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerBtn: { backgroundColor: 'rgba(255,255,255,0.12)' },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.bodyLg,
    letterSpacing: -0.2,
    color: '#fff',
  },
  headerSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: 'rgba(255,255,255,0.6)',
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
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING[2],
  },
  bubbleRowMine: { justifyContent: 'flex-end' },
  senderName: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.nano,
    color: 'rgba(15,24,44,0.6)',
    marginLeft: SPACING[3],
    marginBottom: SPACING[0.5],
  },
  bubble: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderBottomLeftRadius: 4,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    shadowColor: '#0F182C',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleMine: {
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
    shadowOpacity: 0,
  },
  bubblePending: { opacity: 0.6 },
  bubbleText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textPrimary,
  },
  bubbleTextMine: { color: '#fff' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    alignSelf: 'flex-end',
    marginTop: SPACING[0.5],
  },
  bubbleTime: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.nano,
    color: 'rgba(15,24,44,0.35)',
  },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.7)' },
  imageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    alignSelf: 'flex-end',
    marginTop: SPACING[1],
  },
  imageStatus: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.nano,
    color: 'rgba(15,24,44,0.45)',
    alignSelf: 'flex-end',
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
    paddingVertical: SPACING[2.5],
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,24,44,0.08)',
  },
  inputBarAnnounce: { backgroundColor: '#FFF6E9' },
  attachBtn: {
    width: 38,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    // Grows with the message instead of scrolling a single line sideways,
    // matching the DM screen. The radius is half the collapsed height so it
    // still reads as a pill when empty.
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: '#F0F1F3',
    borderRadius: RADIUS['2xl'],
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2.5],
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS['2xl'],
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnAnnounce: { backgroundColor: '#E8940A' },
  sendBtnDisabled: { backgroundColor: COLORS.disabled },
});
