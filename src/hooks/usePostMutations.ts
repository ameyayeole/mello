import {
  useMutation,
  useQueryClient,
  QueryClient,
  UseMutationOptions,
} from '@tanstack/react-query';
import { createTextPost, deletePost } from '@/services/community/posts.service';
import { queryKeys } from '@/constants/queryKeys';
import { PostVisibility, Profile } from '@/types/models';
import { useAuthStore } from '@/stores/authStore';

export type CreatePostArgs = { body: string; visibility: PostVisibility };

// Built as a factory (like participationMutations) so the cache bookkeeping can
// be tested against a bare QueryClient without a renderer.
export function postMutations(qc: QueryClient, user: Profile | null) {
  const create: UseMutationOptions<string, unknown, CreatePostArgs> = {
    mutationFn: (args) =>
      createTextPost({
        authorId: user!.id,
        body: args.body,
        visibility: args.visibility,
        city: user?.city ?? null,
      }),
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
