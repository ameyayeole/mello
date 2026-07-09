import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  SafeAreaView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useEventChat } from '@/hooks/useEventChat';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Message } from '@/types/models';
import { formatChatTime } from '@/utils/time';
import {
  Avatar,
  CategoryTile,
  Icon,
  IconButton,
  PressableScale,
} from '@/components/ui';
import {
  SosButton,
  MoneyGuardBanner,
  useMoneyGuard,
} from '@/components/safety';

function MessageBubble({
  message,
  isMine,
}: {
  message: Message;
  isMine: boolean;
}) {
  if (message.type === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

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
        <View style={[styles.bubble, isMine && styles.bubbleMine]}>
          <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
            {message.content}
          </Text>
          <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
            {formatChatTime(message.created_at)}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function GroupChatScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { messages, send } = useEventChat(eventId);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);

  // Lightweight header info (title + activity for the category tile, plus
  // what the SOS sheet needs for "Share my plan" and reporting the host).
  const { data: event } = useQuery({
    queryKey: ['eventTitle', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('title, activity, starts_at, location_name, host_id')
        .eq('id', eventId)
        .single();
      if (error) throw error;
      return data as {
        title: string;
        activity: string;
        starts_at: string;
        location_name: string | null;
        host_id: string;
      };
    },
    enabled: !!eventId,
  });

  // Scam guard (#11): warn the recipient when a message looks like a money
  // request, once per conversation per day.
  const moneyGuard = useMoneyGuard(eventId, messages, user?.id);

  function handleSend() {
    const text = input.trim();
    if (!text || !user) return;
    setInput('');
    send.mutate({ senderId: user.id, content: text });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        {event?.activity ? (
          <CategoryTile activity={event.activity} size={38} radius={11} />
        ) : null}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {event?.title ?? 'Event chat'}
          </Text>
          <Text style={styles.headerSub}>Group chat</Text>
        </View>
        <SosButton
          event={event ?? null}
          onReport={
            event ? () => router.push(`/friends/${event.host_id}`) : undefined
          }
        />
      </View>

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

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Message…"
            placeholderTextColor="rgba(15,24,44,0.40)"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <PressableScale
            scaleTo={0.85}
            style={[
              styles.sendBtn,
              (!input.trim() || send.isPending) && styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            disabled={!input.trim() || send.isPending}
            accessibilityLabel="Send message"
          >
            <Icon name="send" size={19} color="#fff" strokeWidth={2} />
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,24,44,0.08)',
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: COLORS.textPrimary,
  },
  headerSub: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    color: COLORS.success,
    marginTop: 1,
  },
  messageList: { padding: 16, gap: 10 },
  systemRow: { alignItems: 'center', marginVertical: 4 },
  systemText: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    color: 'rgba(15,24,44,0.4)',
    backgroundColor: 'rgba(15,24,44,0.06)',
    paddingHorizontal: 13,
    paddingVertical: 5,
    borderRadius: 100,
    overflow: 'hidden',
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  bubbleRowMine: { justifyContent: 'flex-end' },
  senderName: {
    fontFamily: FONTS.bold,
    fontSize: 10.5,
    color: 'rgba(15,24,44,0.6)',
    marginLeft: 12,
    marginBottom: 3,
  },
  bubble: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 13,
    paddingVertical: 9,
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
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.textPrimary,
  },
  bubbleTextMine: { color: '#fff' },
  bubbleTime: {
    fontFamily: FONTS.medium,
    fontSize: 10.5,
    color: 'rgba(15,24,44,0.35)',
    marginTop: 3,
    alignSelf: 'flex-end',
  },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.7)' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,24,44,0.08)',
  },
  input: {
    flex: 1,
    height: 42,
    backgroundColor: '#F0F1F3',
    borderRadius: 100,
    paddingHorizontal: 16,
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: COLORS.disabled },
});
