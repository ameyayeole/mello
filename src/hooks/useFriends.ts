import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getFriends,
  getPendingRequests,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
} from '@/services/friends.service';
import { useAuthStore } from '@/stores/authStore';

export function useFriends() {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();

  const friendsQuery = useQuery({
    queryKey: ['friends', userId],
    queryFn: () => getFriends(userId!),
    enabled: !!userId,
  });

  const pendingQuery = useQuery({
    queryKey: ['friendRequests', userId],
    queryFn: () => getPendingRequests(userId!),
    enabled: !!userId,
  });

  const sendRequest = useMutation({
    mutationFn: (addresseeId: string) => sendFriendRequest(userId!, addresseeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friends', userId] }),
  });

  const accept = useMutation({
    mutationFn: (friendshipId: string) => acceptFriendRequest(friendshipId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friends', userId] });
      qc.invalidateQueries({ queryKey: ['friendRequests', userId] });
    },
  });

  const remove = useMutation({
    mutationFn: (friendshipId: string) => removeFriend(friendshipId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friends', userId] }),
  });

  return { friendsQuery, pendingQuery, sendRequest, accept, remove };
}
