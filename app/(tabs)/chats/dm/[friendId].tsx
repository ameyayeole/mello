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
import { useDirectChat } from '@/hooks/useDirectChat';
import { useActiveChat } from '@/hooks/useActiveChat';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { getDmPin, setDmPin } from '@/services/dm.service';
import { getChatPrefs, chatKey } from '@/services/chatPrefs.service';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { DirectMessage } from '@/types/models';
import { formatChatTime } from '@/utils/time';
import { isPremium } from '@/utils/premium';
import {
  Avatar,
  Icon,
  NavButton,
  PremiumBadge,
  PressableScale,
} from '@/components/ui';
import { MoneyGuardBanner, useMoneyGuard } from '@/components/safety';
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

function tickStatus(message: DirectMessage): TickStatus {
  if (message._status === 'sending') return 'sending';
  return message.read_at ? 'read' : 'sent';
}

function MessageBubble({
  message,
  isMine,
  mentionables,
  onLongPress,
}: {
  message: DirectMessage;
  isMine: boolean;
  mentionables?: Map<string, string>;
  onLongPress?: (message: DirectMessage) => void;
}) {
  if (message.type === 'image') {
    return (
      <Animated.View
        entering={FadeInDown.duration(250)}
        style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}
      >
        <PressableScale
          scaleTo={0.98}
          onLongPress={() => onLongPress?.(message)}
          delayLongPress={350}
        >
          <ChatImageBubble
            uri={message.content}
            dimmed={message._status === 'sending'}
          />
          {isMine && (
            <View style={styles.imageMetaRow}>
              <Text style={styles.imageMetaTime}>
                {formatChatTime(message.created_at)}
              </Text>
              <Ticks status={tickStatus(message)} />
            </View>
          )}
        </PressableScale>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(250)}
      style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}
    >
      <PressableScale
        style={[styles.bubble, isMine && styles.bubbleMine]}
        onLongPress={() => onLongPress?.(message)}
        delayLongPress={350}
      >
        <MentionText
          content={message.content}
          style={[styles.bubbleText, isMine && styles.bubbleTextMine]}
          mentionables={mentionables}
          light={isMine}
        />
        <View style={styles.metaRow}>
          <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
            {formatChatTime(message.created_at)}
          </Text>
          {isMine && <Ticks status={tickStatus(message)} light />}
        </View>
      </PressableScale>
    </Animated.View>
  );
}

export default function DirectChatScreen() {
  const { friendId } = useLocalSearchParams<{ friendId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // The tab bar hides on a conversation, so the composer sits on the screen
  // edge and owes the home indicator its own inset — but only with the
  // keyboard down, or it opens a gap above the keys.
  const composerInset = useKeyboardVisible() ? 0 : insets.bottom;
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  useActiveChat(friendId ? `dm:${friendId}` : null);
  const [input, setInput] = useState('');
  const [messageSheet, setMessageSheet] = useState<DirectMessage | null>(null);
  const listRef = useRef<FlatList>(null);

  const prefsQuery = useQuery({
    queryKey: queryKeys.chatPrefs.of(user?.id),
    queryFn: () => getChatPrefs(user!.id),
    enabled: !!user,
  });
  const pref = prefsQuery.data?.get(chatKey('dm', friendId));

  const { messages, send, sendImage, remove } = useDirectChat(
    friendId,
    pref?.cleared_at ?? null
  );

  // Scam guard (#11): warn when an incoming message looks like a money
  // request, once per conversation per day.
  const moneyGuard = useMoneyGuard(
    friendId ? `dm.${friendId}` : undefined,
    messages,
    user?.id
  );

  const { data: friend } = useQuery({
    queryKey: ['profileName', friendId],
    queryFn: async () => {
      // SELECT * so this keeps working before migration 024 adds the
      // premium columns (naming them would 400 on older databases).
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', friendId)
        .single();
      if (error) throw error;
      return data as {
        name: string;
        username?: string;
        photo_url: string | null;
        is_premium?: boolean;
        premium_until?: string | null;
      };
    },
    enabled: !!friendId,
  });

  // Pinned message for this conversation (either side can pin).
  const { data: pinnedMessage } = useQuery({
    queryKey: ['dmPin', user?.id, friendId],
    queryFn: () => getDmPin(user!.id, friendId),
    enabled: !!user && !!friendId,
  });

  // Both people in a DM are mentionable.
  const mentionPeople: Mentionable[] = useMemo(() => {
    const people: Mentionable[] = [];
    if (friend?.username) {
      people.push({
        id: friendId,
        username: friend.username,
        name: friend.name,
        photo_url: friend.photo_url,
      });
    }
    return people;
  }, [friend, friendId]);

  const mentionables = useMemo(() => {
    const map = new Map<string, string>();
    if (friend?.username) map.set(friend.username.toLowerCase(), friendId);
    if (user?.username) map.set(user.username.toLowerCase(), user.id);
    return map;
  }, [friend?.username, friendId, user?.username, user?.id]);

  const mentionQuery = activeMentionQuery(input);

  function handleSend() {
    const text = input.trim();
    if (!text || !user) return;
    setInput('');
    send.mutate(
      { content: text },
      {
        onError: (e) => {
          // Restore the text so it isn't lost, and surface the real reason
          // (e.g. direct_messages table/RLS not set up yet).
          setInput(text);
          Alert.alert(
            'Message not sent',
            e?.message ?? 'Something went wrong.'
          );
        },
      }
    );
  }

  async function handleAttach() {
    if (!user) return;
    const uri = await pickChatImage();
    if (!uri) return;
    sendImage.mutate(
      { localUri: uri },
      { onError: (e) => showError(e, 'Photo not sent') }
    );
  }

  function reportMessage(message: DirectMessage) {
    if (!user) return;
    promptReportMessage({
      reporterId: user.id,
      offenderId: message.sender_id,
      context: `DM ${message.id}: "${messageExcerpt(message)}"`,
    });
  }

  function refreshPin() {
    qc.invalidateQueries({ queryKey: ['dmPin', user?.id, friendId] });
  }

  function messageOptions(message: DirectMessage): SheetOption[] {
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
    options.push({
      icon: 'pin',
      label: 'Pin message',
      sub: 'Shown at the top of this chat',
      onPress: async () => {
        try {
          await setDmPin(user.id, friendId, message.id);
          refreshPin();
        } catch (e) {
          showError(e);
        }
      },
    });
    if (!mine) {
      options.push({
        icon: 'flag',
        label: 'Report',
        danger: true,
        onPress: () => reportMessage(message),
      });
    }
    if (mine) {
      options.push({
        icon: 'trash',
        label: 'Delete message',
        danger: true,
        onPress: () => {
          remove(message.id);
          if (pinnedMessage?.id === message.id) refreshPin();
        },
      });
    }
    return options;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <NavButton
          color={COLORS.white}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Avatar name={friend?.name} photoUrl={friend?.photo_url} size={38} />
        <View style={styles.headerText}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {friend?.name ?? 'Chat'}
            </Text>
            {isPremium(friend) && <PremiumBadge size={14} />}
          </View>
          <Text style={styles.headerSub}>
            {friend?.username ? `@${friend.username}` : 'Direct message'}
          </Text>
        </View>
      </View>

      {pinnedMessage && (
        <PinnedMessageBanner
          senderName={pinnedMessage.sender?.name}
          content={pinnedMessage.content}
          isImage={pinnedMessage.type === 'image'}
          onUnpin={async () => {
            try {
              await setDmPin(user!.id, friendId, null);
              refreshPin();
            } catch (e) {
              showError(e);
            }
          }}
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
              mentionables={mentionables}
              onLongPress={setMessageSheet}
            />
          )}
          contentContainerStyle={styles.messageList}
          style={styles.flex}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Avatar
                name={friend?.name}
                photoUrl={friend?.photo_url}
                size={62}
              />
              <Text style={styles.emptyName}>{friend?.name ?? 'Friend'}</Text>
              <Text style={styles.emptyText}>
                Say hi — you're now connected on Mello.
              </Text>
            </View>
          }
        />

        <MoneyGuardBanner
          visible={moneyGuard.visible}
          onDismiss={moneyGuard.dismiss}
          onReport={() => {
            moneyGuard.dismiss();
            router.push(`/friends/${friendId}`);
          }}
        />

        {mentionQuery !== null && (
          <MentionAutocomplete
            query={mentionQuery}
            people={mentionPeople}
            onPick={(username) => setInput((prev) => insertMention(prev, username))}
          />
        )}

        <View
          style={[
            styles.inputBar,
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
            placeholder="Message…"
            placeholderTextColor="rgba(15,24,44,0.40)"
            value={input}
            onChangeText={setInput}
            multiline
          />
          <PressableScale
            scaleTo={0.85}
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim()}
            accessibilityLabel="Send message"
          >
            <Icon name="send" size={19} color="#fff" strokeWidth={2} />
          </PressableScale>
        </View>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={!!messageSheet}
        title="Message"
        options={messageSheet ? messageOptions(messageSheet) : []}
        onClose={() => setMessageSheet(null)}
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
  headerText: { flex: 1, minWidth: 0 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1] },
  headerTitle: {
    flexShrink: 1,
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
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '74%',
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
  imageMetaTime: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.nano,
    color: 'rgba(15,24,44,0.4)',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: SPACING[1.5],
  },
  emptyName: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textPrimary,
    marginTop: SPACING[1.5],
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING[2],
    paddingHorizontal: SPACING[3.5],
    paddingVertical: SPACING[2.5],
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,24,44,0.08)',
  },
  attachBtn: {
    width: 38,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
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
  sendBtnDisabled: { backgroundColor: COLORS.disabled },
});
