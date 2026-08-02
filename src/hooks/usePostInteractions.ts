import {
  useMutation,
  useQueryClient,
  QueryClient,
  UseMutationOptions,
  InfiniteData,
} from '@tanstack/react-query';
import { likePost, unlikePost } from '@/services/community/postLikes.service';
import { queryKeys } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';

// Pure page-mapper: return new pages with `patch` applied to the one post whose
// id matches. New arrays only where something changed — untouched pages keep
// their identity, so React/Query skip re-rendering rows that didn't move.
export function patchPostInFeed(
  pages: CommunityPost[][],
  postId: string,
  patch: (p: CommunityPost) => CommunityPost
): CommunityPost[][] {
  return pages.map((page) => {
    if (!page.some((p) => p.id === postId)) return page;
    return page.map((p) => (p.id === postId ? patch(p) : p));
  });
}

type ToggleArgs = { postId: string; liked: boolean };
type Ctx = { prev: InfiniteData<CommunityPost[]> | undefined };

// Factory (like participationMutations) so cache bookkeeping is testable against
// a bare QueryClient with no renderer.
//
// Deliberately NO invalidate on settle: the feed is a keyset infinite query, and
// invalidating it mid-scroll would refetch pages and can reshuffle/jump — the
// exact class of bug keyset pagination was chosen to avoid. A like is an
// optimistic page-patch + rollback on error; the count reconciles on the next
// natural refetch (pull-to-refresh / focus). Matches spec §6.
//
// `profileUserId` selects WHICH infinite query holds the post. The profile's
// Posts tab (`userPosts`) and the main feed (`feed`) are separate caches with
// separate keys — patching the feed while the profile is on screen leaves the
// tap with no visible effect at all, which is exactly the bug this argument
// fixes. Omit it on the feed and the post detail screen.
export function likeMutations(
  qc: QueryClient,
  userId: string,
  profileUserId?: string
) {
  const key = profileUserId
    ? queryKeys.community.userPosts.of(profileUserId)
    : queryKeys.community.feed.of(userId);

  const toggle: UseMutationOptions<void, unknown, ToggleArgs, Ctx> = {
    mutationFn: ({ postId, liked }) =>
      liked ? unlikePost({ postId, userId }) : likePost({ postId, userId }),
    onMutate: async ({ postId, liked }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<InfiniteData<CommunityPost[]>>(key);
      if (prev) {
        qc.setQueryData<InfiniteData<CommunityPost[]>>(key, {
          ...prev,
          pages: patchPostInFeed(prev.pages, postId, (p) => ({
            ...p,
            liked_by_me: !liked,
            like_count: Math.max(0, p.like_count + (liked ? -1 : 1)),
          })),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
  };

  return { toggle };
}

// Pass `profileUserId` when the post is rendered on a profile's Posts tab so the
// optimistic patch lands on that cache. Unconditional call — the argument picks
// the key, so the hook order never varies between renders.
export function useToggleLike(profileUserId?: string) {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id) ?? '';
  return useMutation(likeMutations(qc, userId, profileUserId).toggle);
}
