import { useEffect } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  UseMutationOptions,
} from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import {
  getComments,
  getReplies,
  addComment,
  deleteComment,
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
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const query = useQuery({
    queryKey: queryKeys.community.comments.of(postId),
    queryFn: () => getComments({ postId, viewerId: user!.id }),
    enabled: !!user && !!postId,
  });

  // Live while the sheet is mounted: any change to this post's comments refetches
  // the thread (the reconciler behind the optimistic add). Mirrors useReactions'
  // channel pattern.
  useEffect(() => {
    if (!postId) return;
    const channel = supabase
      .channel(`post_comments:${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_comments',
          filter: `post_id=eq.${postId}`,
        },
        () =>
          qc.invalidateQueries({
            queryKey: queryKeys.community.comments.of(postId),
          })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId, qc]);

  return query;
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
