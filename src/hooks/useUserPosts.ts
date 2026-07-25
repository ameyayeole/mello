import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getUserPosts, FeedCursor } from '@/services/community/posts.service';
import { nextCommunityCursor } from '@/hooks/useCommunityFeed';
import { useAuthStore } from '@/stores/authStore';

const PAGE_SIZE = 12;

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
