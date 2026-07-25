import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  UseMutationOptions,
} from '@tanstack/react-query';
import {
  getComments,
  getReplies,
  addComment,
  deleteComment,
  setCommentsEnabled,
} from '@/services/community/comments.service';
import { queryKeys, DISCOVERY_FEED_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { Profile } from '@/types/models';

export type AddCommentArgs = { body: string; parentId: string | null };
export type RemoveCommentArgs = { commentId: string; hasReplies: boolean };

// Factory (like participationMutations) so cache bookkeeping is testable against
// a bare QueryClient. add/remove invalidate the thread AND the discovery feeds so
// the post card's comment_count refreshes. Optimism is light here: the realtime
// subscription in useComments is the reconciler, so a plain invalidate keeps the
// thread correct without hand-rolled cache surgery.
export function commentMutations(
  qc: QueryClient,
  postId: string,
  user: Profile | null
) {
  const key = queryKeys.community.comments.of(postId);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key });
    DISCOVERY_FEED_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
  };

  const add: UseMutationOptions<string, unknown, AddCommentArgs> = {
    mutationFn: (args) =>
      addComment({
        postId,
        authorId: user!.id,
        body: args.body,
        parentId: args.parentId,
      }),
    onSuccess: (_id, args) => {
      invalidate();
      // A reply changes its parent's reply list too.
      if (args.parentId) {
        qc.invalidateQueries({ queryKey: queryKeys.community.replies.of(args.parentId) });
      }
    },
  };

  const remove: UseMutationOptions<void, unknown, RemoveCommentArgs> = {
    mutationFn: (args) => deleteComment(args),
    onSuccess: invalidate,
  };

  return { add, remove };
}

export function useComments(postId: string) {
  const user = useAuthStore((s) => s.user);
  // No realtime: the thread refetches on mount and after the optimistic add's
  // invalidate. Other people's comments surface on reopen / refetch, not live.
  return useQuery({
    queryKey: queryKeys.community.comments.of(postId),
    queryFn: () => getComments({ postId, viewerId: user!.id }),
    enabled: !!user && !!postId,
  });
}

export function useCommentReplies(parentId: string, enabled: boolean) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.community.replies.of(parentId),
    queryFn: () => getReplies({ parentId, viewerId: user!.id }),
    enabled: !!user && enabled,
  });
}

export function useAddComment(postId: string) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation(commentMutations(qc, postId, user).add);
}

export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation(commentMutations(qc, postId, user).remove);
}

// Post author only: flip comments on/off. Invalidates the feeds so every card's
// comments_enabled (from community_feed) reflects the change.
export function useSetCommentsEnabled(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setCommentsEnabled({ postId, enabled }),
    onSuccess: () =>
      DISCOVERY_FEED_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey })),
  });
}
