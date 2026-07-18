import { supabase } from './supabase';
import { Message } from '@/types/models';

export async function getMessages(
  eventId: string,
  limit = 50,
  // "Delete chat" support: only messages after this ISO timestamp.
  after?: string | null
): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select('*, sender:profiles!sender_id(*)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (after) query = query.gt('created_at', after);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as Message[]).reverse();
}

export async function sendMessage(
  eventId: string,
  senderId: string,
  content: string,
  // Optional client-minted id so an optimistic message can be matched to its
  // realtime echo. Falls back to the DB default when omitted.
  id?: string,
  type: Message['type'] = 'text'
): Promise<void> {
  const { error } = await supabase.from('messages').insert({
    ...(id ? { id } : {}),
    event_id: eventId,
    sender_id: senderId,
    content,
    type,
  });

  if (error) throw error;
}

// Hard delete — allowed for your own messages, or any message in an event you
// host (RLS in migration 030).
export async function deleteMessage(id: string): Promise<void> {
  const { error } = await supabase.from('messages').delete().eq('id', id);
  if (error) throw error;
}

// Pin (or unpin with null) a message in an event chat. Host only — the events
// UPDATE policy is host-scoped.
export async function pinEventMessage(
  eventId: string,
  messageId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ pinned_message_id: messageId })
    .eq('id', eventId);
  if (error) throw error;
}

// Lock the event chat to host-only messages (enforced by RLS). Host only.
export async function setChatLocked(
  eventId: string,
  locked: boolean
): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ chat_locked: locked })
    .eq('id', eventId);
  if (error) throw error;
}

export async function getMessageById(id: string): Promise<Message | null> {
  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles!sender_id(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) return null;
  return data as unknown as Message | null;
}

// Read watermarks for one event chat (migration 031): user_id → last_read_at.
// A message shows ✓✓ once every other member's watermark passes it.
export async function getChatReads(
  eventId: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await supabase
    .from('chat_reads')
    .select('user_id, last_read_at')
    .eq('event_id', eventId);
  if (error) return map;
  for (const row of (data ?? []) as { user_id: string; last_read_at: string }[]) {
    map.set(row.user_id, row.last_read_at);
  }
  return map;
}

// Bumps the caller's read watermark for this chat. Best-effort pre-migration.
export async function upsertChatRead(
  eventId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase.from('chat_reads').upsert(
    { event_id: eventId, user_id: userId, last_read_at: new Date().toISOString() },
    { onConflict: 'event_id,user_id' }
  );
  if (error) throw error;
}

// Latest message timestamp per event, for inbox sorting and "deleted chat"
// hiding. Best-effort single query over the given events.
export async function getLastMessageTimes(
  eventIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (eventIds.length === 0) return map;
  const { data, error } = await supabase
    .from('messages')
    .select('event_id, created_at')
    .in('event_id', eventIds)
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) return map;
  for (const row of (data ?? []) as { event_id: string; created_at: string }[]) {
    if (!map.has(row.event_id)) map.set(row.event_id, row.created_at);
  }
  return map;
}
