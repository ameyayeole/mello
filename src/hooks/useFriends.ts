import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAllFriendships,
  getRelationship,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
} from '@/services/friends.service';
import { getProfile } from '@/services/auth.service';
import { useAuthStore } from '@/stores/authStore';

export function useFriends() {
  const userId = useAuthStore((s) => s.user?.id);
  const setUser = useAuthStore((s) => s.setUser);
  const qc = useQueryClient();

  // Single source of truth: every friendship row involving the user (any
  // status). Friends, pending requests and per-user relationship state are all
  // derived from this so they can never disagree.
  const friendshipsQuery = useQuery({
    queryKey: ['friendships', userId],
    queryFn: () => getAllFriendships(userId!),
    enabled: !!userId,
  });

  const all = useMemo(() => friendshipsQuery.data ?? [], [friendshipsQuery.data]);

  const friends = useMemo(
    () => all.filter((f) => f.status === 'accepted'),
    [all]
  );

  // Incoming requests waiting on the current user to accept.
  const pending = useMemo(
    () => all.filter((f) => f.status === 'pending' && f.addressee_id === userId),
    [all, userId]
  );

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['friendships', userId] });

  // Accepting and unfriending change friends_count for both users (via DB
  // triggers). Refresh the friendship list, any open profile screens, and the
  // current user's cached profile in the auth store so the count updates live.
  const refreshCounts = async () => {
    invalidate();
    qc.invalidateQueries({ queryKey: ['profile'] });
    if (userId) {
      try {
        const profile = await getProfile(userId);
        if (profile) setUser(profile);
      } catch {
        // non-fatal: count just won't refresh until next load
      }
    }
  };

  const sendRequest = useMutation({
    mutationFn: (addresseeId: string) => sendFriendRequest(userId!, addresseeId),
    onSuccess: invalidate,
  });

  const accept = useMutation({
    mutationFn: (friendshipId: string) => acceptFriendRequest(friendshipId),
    onSuccess: refreshCounts,
  });

  const remove = useMutation({
    mutationFn: (friendshipId: string) => removeFriend(friendshipId),
    onSuccess: refreshCounts,
  });

  // Relationship between the current user and any other user.
  const relationshipWith = (otherUserId: string) =>
    getRelationship(all, userId!, otherUserId);

  return {
    friendshipsQuery,
    friends,
    pending,
    sendRequest,
    accept,
    remove,
    relationshipWith,
  };
}
