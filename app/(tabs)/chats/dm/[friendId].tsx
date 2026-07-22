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
import { useReactions } from '@/hooks/useReactions';
import { useActiveChat } from '@/hooks/useActiveChat';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { getDmPin, setDmPin } from '@/services/dm.service';
import { getChatPrefs, chatKey } from '@/services/chatPrefs.service';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { DirectMessage } from '@/types/models';
import { isPremium } from '@/utils/premium';
import { runFlags } from '@/utils/messageGroups';
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
  MessageBubble,
  PinnedMessageBanner,
  MentionAutocomplete,
  Mentionable,
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

  // Tapbacks. Optimistic rows carry a temporary id the server has never seen,
  // so they're left out until the insert comes back.
  const reactableIds = useMemo(
    () => messages.filter((m) => !m._status).map((m) => m.id),
    [messages]
  );
  const { byMessage: reactions, toggle: react } = useReactions(
    'dm',
    friendId,
    reactableIds
  );
  const [reactingTo, setReactingTo] = useState<string | null>(null);

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
          renderItem={({ item, index }) => {
            const isMine = item.sender_id === user?.id;
            const { isLastOfRun } = runFlags(
              messages[index - 1],
              item,
              messages[index + 1]
            );

            return (
              <MessageBubble
                content={item.content}
                type={item.type === 'image' ? 'image' : 'text'}
                createdAt={item.created_at}
                isMine={isMine}
                status={item._status}
                sender={{
                  id: friendId,
                  name: friend?.name,
                  photoUrl: friend?.photo_url,
                }}
                showAvatar={isLastOfRun}
                // A DM has one other person in it and their name is in the
                // header — a label over every run would be noise.
                showName={false}
                tick={isMine ? tickStatus(item) : undefined}
                mentionables={mentionables}
                reactions={reactions.get(item.id)}
                myUserId={user?.id}
                reactionBarOpen={reactingTo === item.id}
                onReact={(emoji) => {
                  react(item.id, emoji);
                  setReactingTo(null);
                }}
                onOpenReactions={
                  item._status ? undefined : () => setReactingTo(item.id)
                }
                onCloseReactions={() => setReactingTo(null)}
                onLongPress={() => {
                  setReactingTo(null);
                  setMessageSheet(item);
                }}
                onAvatarPress={() => router.push(`/friends/${friendId}`)}
              />
            );
          }}
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
