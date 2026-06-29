import { supabase } from './supabase';
import { DirectMessage, FriendConversation, Profile } from '@/types/models';

// Messages exchanged between the current user and one friend, oldest first.
export async function getDirectMessages(
  userId: string,
  friendId: string,
  limit = 50
): Promise<DirectMessage[]> {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*, sender:profiles!sender_id(*)')
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${friendId}),` +
        `and(sender_id.eq.${friendId},recipient_id.eq.${userId})`
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as unknown as DirectMessage[]).reverse();
}

export async function sendDirectMessage(
  senderId: string,
  recipientId: string,
  content: string
): Promise<DirectMessage> {
  const { data, error } = await supabase
    .from('direct_messages')
    .insert({ sender_id: senderId, recipient_id: recipientId, content, type: 'text' })
    .select('*, sender:profiles!sender_id(*)')
    .single();

  if (error) throw error;
  return data as unknown as DirectMessage;
}

// Inbox for the Friends tab: every accepted friend with their last message (if
// any), sorted by most recent conversation, then alphabetically.
export async function getFriendConversations(
  userId: string
): Promise<FriendConversation[]> {
  const { data: fdata, error: ferr } = await supabase
    .from('friendships')
    .select('*, requester:profiles!requester_id(*), addressee:profiles!addressee_id(*)')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq('status', 'accepted');

  if (ferr) throw ferr;

  const friends: Profile[] = ((fdata ?? []) as any[])
    .map((f) => (f.requester_id === userId ? f.addressee : f.requester))
    .filter(Boolean);

  // Last-message previews are best-effort: if the direct_messages table/query
  // fails (e.g. migration 008 not applied yet), still return the friend list
  // so the Friends tab works — conversations just won't show a preview.
  const lastByFriend = new Map<string, DirectMessage>();
  const { data: mdata } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(300);

  for (const m of (mdata ?? []) as DirectMessage[]) {
    const other = m.sender_id === userId ? m.recipient_id : m.sender_id;
    if (!lastByFriend.has(other)) lastByFriend.set(other, m);
  }

  return friends
    .map((friend) => ({ friend, lastMessage: lastByFriend.get(friend.id) ?? null }))
    .sort((a, b) => {
      const ta = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
      const tb = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return (a.friend.name ?? '').localeCompare(b.friend.name ?? '');
    });
}
