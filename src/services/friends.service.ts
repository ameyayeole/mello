import { supabase } from './supabase';
import { Friendship, Profile } from '@/types/models';

/**
 * The relationship the current user has with another user. Drives which
 * action (Add / Requested / Accept / Friends) the UI should show.
 */
export type RelationshipStatus =
  | 'none' // no friendship row exists
  | 'friends' // accepted friendship
  | 'request_sent' // current user sent a pending request
  | 'request_received' // other user sent a pending request to the current user
  | 'blocked';

export interface Relationship {
  status: RelationshipStatus;
  friendshipId: string | null;
}

/**
 * Fetches every friendship row that involves the user (any status), with both
 * profiles joined. This is the single source of truth the friends UI derives
 * accepted friends, pending requests, and per-user relationship state from.
 */
export async function getAllFriendships(userId: string): Promise<Friendship[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(`
      *,
      requester:profiles!requester_id(*),
      addressee:profiles!addressee_id(*)
    `)
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (error) throw error;

  return ((data ?? []) as any[]).map((f) => ({
    ...f,
    friend: f.requester_id === userId ? f.addressee : f.requester,
  })) as Friendship[];
}

/**
 * Resolves the relationship between `userId` and `otherUserId` from a list of
 * friendships (typically the cached result of `getAllFriendships`).
 */
export function getRelationship(
  friendships: Friendship[],
  userId: string,
  otherUserId: string
): Relationship {
  const f = friendships.find(
    (x) =>
      (x.requester_id === userId && x.addressee_id === otherUserId) ||
      (x.requester_id === otherUserId && x.addressee_id === userId)
  );

  if (!f) return { status: 'none', friendshipId: null };

  if (f.status === 'accepted') return { status: 'friends', friendshipId: f.id };
  if (f.status === 'blocked') return { status: 'blocked', friendshipId: f.id };

  // pending
  return {
    status: f.requester_id === userId ? 'request_sent' : 'request_received',
    friendshipId: f.id,
  };
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
