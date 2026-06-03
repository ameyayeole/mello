import { supabase } from './supabase';
import { Friendship, Profile } from '@/types/models';

export async function getFriends(userId: string): Promise<Friendship[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(`
      *,
      requester:profiles!requester_id(*),
      addressee:profiles!addressee_id(*)
    `)
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq('status', 'accepted');

  if (error) throw error;

  return ((data ?? []) as any[]).map((f) => ({
    ...f,
    friend: f.requester_id === userId ? f.addressee : f.requester,
  })) as Friendship[];
}

export async function getPendingRequests(userId: string): Promise<Friendship[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('*, requester:profiles!requester_id(*)')
    .eq('addressee_id', userId)
    .eq('status', 'pending');

  if (error) throw error;
  return (data ?? []) as unknown as Friendship[];
}

export async function sendFriendRequest(
  requesterId: string,
  addresseeId: string
): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: requesterId, addressee_id: addresseeId });

  if (error) throw error;
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', friendshipId);

  if (error) throw error;
}

export async function removeFriend(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);

  if (error) throw error;
}

export async function searchUsers(query: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .ilike('name', `%${query}%`)
    .limit(20);

  if (error) throw error;
  return (data ?? []) as Profile[];
}
