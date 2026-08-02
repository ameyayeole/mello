import {
  useMutation,
  useQueryClient,
  QueryClient,
  UseMutationOptions,
} from '@tanstack/react-query';
import {
  createTextPost,
  createPhotoPost,
  createSharedWrap,
  deletePost,
} from '@/services/community/posts.service';
import { createPoll } from '@/services/community/polls.service';
import { uploadPostPhotos } from '@/services/storage.service';
import { reportPost } from '@/services/moderation.service';
import { queryKeys } from '@/constants/queryKeys';
import { PostVisibility, Profile } from '@/types/models';
import { useAuthStore } from '@/stores/authStore';

export type CreatePostArgs = {
  body: string;
  visibility: PostVisibility;
  // Local `file://` or remote `http` URIs; empty/undefined ⇒ a text post.
  media?: string[];
};

// Built as a factory (like participationMutations) so the cache bookkeeping can
// be tested against a bare QueryClient without a renderer.
export function postMutations(qc: QueryClient, user: Profile | null) {
  const create: UseMutationOptions<string, unknown, CreatePostArgs> = {
    // Photo posts upload their media first (local URIs → public URLs), then
    // insert; text posts skip straight to the insert. The upload is inside the
    // mutation so the composer's pending state spans it.
    mutationFn: async (args) => {
      if (args.media && args.media.length > 0) {
        const urls = await uploadPostPhotos(user!.id, args.media);
        return createPhotoPost({
          authorId: user!.id,
          body: args.body,
          media: urls,
          visibility: args.visibility,
          city: user?.city ?? null,
        });
      }
      return createTextPost({
        authorId: user!.id,
        body: args.body,
        visibility: args.visibility,
        city: user?.city ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.community.feed.all });
      qc.invalidateQueries({ queryKey: queryKeys.community.userPosts.all });
    },
  };

  const remove: UseMutationOptions<void, unknown, string> = {
    mutationFn: (postId) => deletePost(postId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.community.feed.all });
      qc.invalidateQueries({ queryKey: queryKeys.community.userPosts.all });
    },
  };

  return { create, remove };
}

export function useCreatePost() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation(postMutations(qc, user).create);
}

export function useDeletePost() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation(postMutations(qc, user).remove);
}

// Polls author in three writes with their own arg shape, so this is a plain
// mutation rather than part of the postMutations factory. Same feed + profile
// invalidation as a text/photo create so a new poll appears at the top.
export function useCreatePoll() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation({
    mutationFn: (args: {
      question: string;
      options: string[];
      durationDays: 1 | 3 | 7;
      visibility: PostVisibility;
    }) =>
      createPoll({
        authorId: user!.id,
        question: args.question,
        options: args.options,
        durationDays: args.durationDays,
        visibility: args.visibility,
        city: user?.city ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.community.feed.all });
      qc.invalidateQueries({ queryKey: queryKeys.community.userPosts.all });
    },
  });
}

// Reshare a wrap. No media upload — just references the event; the insert RLS
// (059) requires the author attended it. Same invalidation as a text/photo post.
export function useCreateSharedWrap() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation({
    mutationFn: (args: {
      eventId: string;
      body: string;
      visibility: PostVisibility;
    }) =>
      createSharedWrap({
        authorId: user!.id,
        eventId: args.eventId,
        body: args.body,
        visibility: args.visibility,
        city: user?.city ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.community.feed.all });
      qc.invalidateQueries({ queryKey: queryKeys.community.userPosts.all });
    },
  });
}

// Report a post. Invalidates userPosts caches to remove the reported post
// from all profile views. Matches the pattern of useDeletePost.
export function useReportPost() {
  const qc = useQueryClient();
  const viewerId = useAuthStore((s) => s.user?.id) ?? '';

  return useMutation({
    mutationFn: ({ postId, authorId }: { postId: string; authorId: string }) =>
      reportPost({
        reporterId: viewerId,
        reportedId: authorId,
        postId,
        reason: 'inappropriate',
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: queryKeys.community.userPosts.all,
      });
    },
  });
}
