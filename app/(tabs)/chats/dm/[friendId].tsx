import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useDirectChat } from '@/hooks/useDirectChat';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/colors';
import { DirectMessage } from '@/types/models';
import { formatChatTime } from '@/utils/time';

function MessageBubble({
  message,
  isMine,
}: {
  message: DirectMessage;
  isMine: boolean;
}) {
  return (
    <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, isMine && styles.bubbleMine]}>
        <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
          {message.content}
        </Text>
        <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
          {formatChatTime(message.created_at)}
        </Text>
      </View>
    </View>
  );
}

export default function DirectChatScreen() {
  const { friendId } = useLocalSearchParams<{ friendId: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { messages, send } = useDirectChat(friendId);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);

  const { data: friend } = useQuery({
    queryKey: ['profileName', friendId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', friendId)
        .single();
      if (error) throw error;
      return data as { name: string };
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
          Alert.alert('Message not sent', e?.message ?? 'Something went wrong.');
        },
      }
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backBtn}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {friend?.name ?? 'Chat'}
        </Text>
        <View style={{ width: 32 }} />
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
            <MessageBubble message={item} isMine={item.sender_id === user?.id} />
          )}
          contentContainerStyle={styles.messageList}
          style={styles.flex}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>👋</Text>
              <Text style={styles.emptyText}>
                Say hi to {friend?.name ?? 'your friend'}!
              </Text>
            </View>
          }
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            placeholderTextColor={COLORS.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim()}
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </TouchableOpacity>
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
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { fontSize: 24, color: COLORS.textPrimary, width: 32 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  messageList: { padding: 16, gap: 8, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 12,
  },
  bubbleMine: {
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 15, color: COLORS.textPrimary, lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  bubbleTime: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.8)' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyEmoji: { fontSize: 44 },
  emptyText: { fontSize: 15, color: COLORS.textSecondary },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: COLORS.border },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '800' },
});
