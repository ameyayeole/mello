import {
  useMutation,
  useQueryClient,
  QueryClient,
  UseMutationOptions,
} from '@tanstack/react-query';
import {
  createTextPost,
  createPhotoPost,
  deletePost,
} from '@/services/community/posts.service';
import { uploadPostPhotos } from '@/services/storage.service';
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
    },
  };

  const remove: UseMutationOptions<void, unknown, string> = {
    mutationFn: (postId) => deletePost(postId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.community.feed.all });
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
