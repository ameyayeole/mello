import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getUserPosts, FeedCursor } from '@/services/community/posts.service';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';

const PAGE_SIZE = 12;

// The keyset cursor for the Profile "Posts" tab. Lived in useCommunityFeed
// until the community feed moved to snapshot pagination (migration 066);
// user_posts (057) still paginates by keyset, so it moved here rather than
// being deleted.
function nextCommunityCursor(
  lastPage: CommunityPost[],
  pageSize: number
): FeedCursor | undefined {
  if (lastPage.length < pageSize) return undefined;
  const last = lastPage[lastPage.length - 1];
  return { createdAt: last.created_at, id: last.id };
}

// One profile's posts (the "Posts" tab). Viewer-scoped by the user_posts RPC's
// SECURITY INVOKER + posts RLS; the viewer is the signed-in user. Same keyset
// paging as the main feed.
export function useUserPosts(targetId: string | undefined) {
  const viewerId = useAuthStore((s) => s.user?.id);

  return useInfiniteQuery({
    queryKey: queryKeys.community.userPosts.of(targetId),
    queryFn: ({ pageParam }) =>
      getUserPosts({
        targetId: targetId!,
        viewerId: viewerId!,
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: null as FeedCursor | null,
    getNextPageParam: (lastPage) => nextCommunityCursor(lastPage, PAGE_SIZE),
    enabled: !!targetId && !!viewerId,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
