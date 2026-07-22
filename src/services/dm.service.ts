import { supabase } from './supabase';
import { DirectMessage, FriendConversation, Profile } from '@/types/models';

// Messages exchanged between the current user and one friend, oldest first.
export async function getDirectMessages(
  userId: string,
  friendId: string,
  limit = 50,
  // "Delete chat" support: only messages after this ISO timestamp.
  after?: string | null
): Promise<DirectMessage[]> {
  let query = supabase
    .from('direct_messages')
    .select('*, sender:profiles!sender_id(*)')
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${friendId}),` +
        `and(sender_id.eq.${friendId},recipient_id.eq.${userId})`
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (after) query = query.gt('created_at', after);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as DirectMessage[]).reverse();
}

export async function sendDirectMessage(
  senderId: string,
  recipientId: string,
  content: string,
  type: DirectMessage['type'] = 'text'
): Promise<DirectMessage> {
  const { data, error } = await supabase
    .from('direct_messages')
    .insert({ sender_id: senderId, recipient_id: recipientId, content, type })
    .select('*, sender:profiles!sender_id(*)')
    .single();

  if (error) throw error;
  return data as unknown as DirectMessage;
}

// Marks everything this friend sent you as read (read receipts, migration
// 031). Best-effort: pre-migration the column doesn't exist and this fails.
export async function markDmRead(
  userId: string,
  friendId: string
): Promise<void> {
  const { error } = await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .eq('sender_id', friendId)
    .is('read_at', null);
  if (error) throw error;
}

// How many DMs are sitting unread for this user, for the Inbox tab badge.
// Counts rows, not conversations — `head: true` means no bodies come back.
//
// This is DMs only. Event chats track reads with a `last_read_at` watermark
// per event (migration 031), so counting those means comparing message times
// against a watermark for every event you're in — a per-event query or a new
// RPC. Until that exists the badge under-counts rather than guesses.
export async function getUnreadDmCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('direct_messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

// Unread DMs per conversation, for the badges on the Inbox rows: sender id →
// how many of their messages you haven't opened.
//
// One query rather than a count per row. `head: true` is deliberately NOT used
// here — we need the sender of each unread row to bucket it, and there is no
// GROUP BY in PostgREST. The cap keeps a runaway inbox from pulling the world;
// past it the badges under-count, which is the safe direction.
export async function getUnreadDmCounts(
  userId: string
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const { data, error } = await supabase
    .from('direct_messages')
    .select('sender_id')
    .eq('recipient_id', userId)
    .is('read_at', null)
    .limit(500);
  if (error) return counts;

  for (const row of (data ?? []) as { sender_id: string }[]) {
    counts.set(row.sender_id, (counts.get(row.sender_id) ?? 0) + 1);
  }
  return counts;
}

// Hard delete of your own DM (RLS in migration 030).
export async function deleteDirectMessage(id: string): Promise<void> {
  const { error } = await supabase
    .from('direct_messages')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// One pinned message per DM conversation, keyed on the sorted id pair.
export function dmPairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export async function getDmPin(
  userId: string,
  friendId: string
): Promise<DirectMessage | null> {
  const { data, error } = await supabase
    .from('dm_pins')
    .select('message:direct_messages!message_id(*, sender:profiles!sender_id(*))')
    .eq('pair_key', dmPairKey(userId, friendId))
    .maybeSingle();
  if (error) return null;
  return ((data as any)?.message ?? null) as DirectMessage | null;
}

export async function setDmPin(
  userId: string,
  friendId: string,
  messageId: string | null
): Promise<void> {
  const key = dmPairKey(userId, friendId);
  if (!messageId) {
    const { error } = await supabase.from('dm_pins').delete().eq('pair_key', key);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('dm_pins')
    .upsert(
      { pair_key: key, message_id: messageId, pinned_by: userId },
      { onConflict: 'pair_key' }
    );
  if (error) throw error;
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
