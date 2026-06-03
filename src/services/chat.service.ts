import { supabase } from './supabase';
import { Message } from '@/types/models';

export async function getMessages(
  eventId: string,
  limit = 50
): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:profiles!sender_id(*)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as unknown as Message[]).reverse();
}

export async function sendMessage(
  eventId: string,
  senderId: string,
  content: string
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .insert({ event_id: eventId, sender_id: senderId, content, type: 'text' });

  if (error) throw error;
}
