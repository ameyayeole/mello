import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getPoll, castVote } from '@/services/community/polls.service';
import { useAuthStore } from '@/stores/authStore';

// One poll's render data (options + counts + my vote + closes_at), loaded per
// post rather than folded into the feed RPC.
export function usePoll(postId: string) {
  const viewerId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: queryKeys.community.poll.of(postId),
    queryFn: () => getPoll(postId, viewerId!),
    enabled: !!viewerId,
    staleTime: 30_000,
  });
}

// A cast is terminal: on success we refetch the poll (counts + my_option_id flip
// together), which swaps the card from vote buttons to result bars.
export function useCastVote(postId: string) {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: (optionId: string) =>
      castVote({ pollId: postId, optionId, userId: userId! }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.community.poll.of(postId) }),
  });
}
