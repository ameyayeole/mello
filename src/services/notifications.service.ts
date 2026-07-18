import { supabase } from './supabase';
import { Notification } from '@/types/models';

export async function getNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*, sender:profiles!sender_id(*), event:events(*)')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as unknown as Notification[];
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('is_read', false);

  if (error) throw error;
  return count ?? 0;
}

export async function markAllRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', userId)
    .eq('is_read', false);

  if (error) throw error;
}

export async function markRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) throw error;
}

export async function updatePushToken(
  userId: string,
  token: string
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', userId);

  if (error) throw error;
}
