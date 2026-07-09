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
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useDirectChat } from '@/hooks/useDirectChat';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { DirectMessage } from '@/types/models';
import { formatChatTime } from '@/utils/time';
import { Avatar, Icon, IconButton, PressableScale } from '@/components/ui';
import { MoneyGuardBanner, useMoneyGuard } from '@/components/safety';

function MessageBubble({
  message,
  isMine,
}: {
  message: DirectMessage;
  isMine: boolean;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(250)}
      style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}
    >
      <View style={[styles.bubble, isMine && styles.bubbleMine]}>
        <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
          {message.content}
        </Text>
        <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
          {formatChatTime(message.created_at)}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function DirectChatScreen() {
  const { friendId } = useLocalSearchParams<{ friendId: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { messages, send } = useDirectChat(friendId);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);

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
      const { data, error } = await supabase
        .from('profiles')
        .select('name, photo_url')
        .eq('id', friendId)
        .single();
      if (error) throw error;
      return data as { name: string; photo_url: string | null };
    },
    enabled: !!friendId,
  });

  function handleSend() {
    const text = input.trim();
    if (!text || !user) return;
    setInput('');
    send.mutate(
      { content: text },
      {
        onError: (e: any) => {
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Avatar name={friend?.name} photoUrl={friend?.photo_url} size={38} />
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {friend?.name ?? 'Chat'}
          </Text>
          <Text style={styles.headerSub}>Direct message</Text>
        </View>
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

        <View style={styles.inputBar}>
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
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  messageList: { padding: 16, gap: 10, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '74%',
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
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 6,
  },
  emptyName: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.textPrimary,
    marginTop: 6,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,24,44,0.08)',
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: '#F0F1F3',
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingVertical: 11,
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
