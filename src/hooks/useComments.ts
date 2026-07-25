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
import {
  likeComment,
  unlikeComment,
} from '@/services/community/commentLikes.service';
import { queryKeys, DISCOVERY_FEED_KEYS } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { Profile, PostComment } from '@/types/models';

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

// ── Comment likes ────────────────────────────────────────────────────────────

// Flip liked_by_me + move like_count on the one comment (by id) inside a
// PostComment[] cache. Pure, so it's testable and reused for both the top-level
// thread cache and a parent's replies cache.
export function patchCommentLike(
  list: PostComment[] | undefined,
  commentId: string,
  liked: boolean
): PostComment[] | undefined {
  if (!list) return list;
  return list.map((c) =>
    c.id === commentId
      ? {
          ...c,
          liked_by_me: !liked,
          like_count: Math.max(0, c.like_count + (liked ? -1 : 1)),
        }
      : c
  );
}

type ToggleCommentLikeArgs = {
  commentId: string;
  parentId: string | null;
  liked: boolean;
};
type CommentLikeCtx = {
  prevComments: PostComment[] | undefined;
  prevReplies: PostComment[] | undefined;
  repliesKey: ReturnType<typeof queryKeys.community.replies.of> | null;
};

// Optimistic comment-like factory. A comment lives in the top-level thread cache
// or — when parentId is set — in that parent's replies cache; patch whichever
// holds it. No invalidate on settle: counts reconcile on the next thread refetch
// (same rationale as post likes — avoid a jarring mid-scroll refetch).
export function commentLikeMutations(
  qc: QueryClient,
  postId: string,
  userId: string
) {
  const commentsKey = queryKeys.community.comments.of(postId);

  const toggle: UseMutationOptions<
    void,
    unknown,
    ToggleCommentLikeArgs,
    CommentLikeCtx
  > = {
    mutationFn: ({ commentId, liked }) =>
      liked
        ? unlikeComment({ commentId, userId })
        : likeComment({ commentId, userId }),
    onMutate: async ({ commentId, parentId, liked }) => {
      const repliesKey = parentId
        ? queryKeys.community.replies.of(parentId)
        : null;
      await qc.cancelQueries({ queryKey: commentsKey });
      if (repliesKey) await qc.cancelQueries({ queryKey: repliesKey });
      const prevComments = qc.getQueryData<PostComment[]>(commentsKey);
      const prevReplies = repliesKey
        ? qc.getQueryData<PostComment[]>(repliesKey)
        : undefined;
      qc.setQueryData<PostComment[]>(commentsKey, (l) =>
        patchCommentLike(l, commentId, liked)
      );
      if (repliesKey) {
        qc.setQueryData<PostComment[]>(repliesKey, (l) =>
          patchCommentLike(l, commentId, liked)
        );
      }
      return { prevComments, prevReplies, repliesKey };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevComments !== undefined) {
        qc.setQueryData(commentsKey, ctx.prevComments);
      }
      if (ctx?.repliesKey && ctx.prevReplies !== undefined) {
        qc.setQueryData(ctx.repliesKey, ctx.prevReplies);
      }
    },
  };

  return { toggle };
}

export function useToggleCommentLike(postId: string) {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id) ?? '';
  return useMutation(commentLikeMutations(qc, postId, userId).toggle);
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
