import { supabase } from './supabase';
import { ilikePattern } from '@/utils/postgrest';
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

export async function searchUsers(
  query: string,
  currentUserId?: string
): Promise<Profile[]> {
  // Match display names and @usernames. Falls back to name-only if the
  // username column doesn't exist yet (migration 029 not applied).
  const q = query.replace(/^@/, '');
  const pattern = ilikePattern(q);
  let { data, error } = await supabase
    .from('profiles')
    .select('*')
    .or(`name.ilike.${pattern},username.ilike.${pattern}`)
    .limit(20);

  // Only retry for the missing-column case this fallback exists for (42703).
  // Retrying on *any* error previously turned real failures into silent
  // name-only results, which hid the malformed-filter bug this call used to
  // produce whenever someone typed a comma.
  if (error?.code === '42703') {
    ({ data, error } = await supabase
      .from('profiles')
      .select('*')
      .ilike('name', `%${q}%`)
      .limit(20));
  }

  if (error) throw error;
  let results = (data ?? []) as Profile[];

  if (currentUserId) {
    // Hide the current user and anyone they've blocked.
    const { data: blocks } = await supabase
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', currentUserId);
    const blockedIds = new Set((blocks ?? []).map((b: any) => b.blocked_id));
    results = results.filter(
      (p) => p.id !== currentUserId && !blockedIds.has(p.id)
    );
  }

  return results;
}
