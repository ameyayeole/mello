import { supabase } from './supabase';
import { ChatPref } from '@/types/models';

export type ChatKey = `event:${string}` | `dm:${string}`;

export function chatKey(chatType: 'event' | 'dm', chatId: string): ChatKey {
  return `${chatType}:${chatId}` as ChatKey;
}

// All of the user's conversation prefs keyed by 'event:<id>' / 'dm:<id>'.
// Best-effort: returns an empty map before migration 030 is applied.
export async function getChatPrefs(
  userId: string
): Promise<Map<ChatKey, ChatPref>> {
  const map = new Map<ChatKey, ChatPref>();
  const { data, error } = await supabase
    .from('chat_prefs')
    .select('*')
    .eq('user_id', userId);
  if (error) return map;
  for (const row of (data ?? []) as ChatPref[]) {
    map.set(chatKey(row.chat_type, row.chat_id), row);
  }
  return map;
}

async function upsertPref(
  userId: string,
  chatType: 'event' | 'dm',
  chatId: string,
  patch: Partial<Pick<ChatPref, 'pinned_at' | 'muted' | 'cleared_at'>>
): Promise<void> {
  const { error } = await supabase.from('chat_prefs').upsert(
    { user_id: userId, chat_type: chatType, chat_id: chatId, ...patch },
    { onConflict: 'user_id,chat_type,chat_id' }
  );
  if (error) throw error;
}

export function setChatPinned(
  userId: string,
  chatType: 'event' | 'dm',
  chatId: string,
  pinned: boolean
): Promise<void> {
  return upsertPref(userId, chatType, chatId, {
    pinned_at: pinned ? new Date().toISOString() : null,
  });
}

export function setChatMuted(
  userId: string,
  chatType: 'event' | 'dm',
  chatId: string,
  muted: boolean
): Promise<void> {
  return upsertPref(userId, chatType, chatId, { muted });
}

// "Delete chat" (hide for me): the conversation disappears from the inbox and
// its history is hidden; it reappears when someone sends a newer message.
export function clearChat(
  userId: string,
  chatType: 'event' | 'dm',
  chatId: string
): Promise<void> {
  return upsertPref(userId, chatType, chatId, {
    cleared_at: new Date().toISOString(),
  });
}
