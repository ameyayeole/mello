import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getCommunityFeed, FeedCursor } from '@/services/community/posts.service';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';

const PAGE_SIZE = 10;

// The next keyset cursor: the last row of a full page. A short page means we've
// reached the end, so there's no next cursor and paging stops.
export function nextCommunityCursor(
  lastPage: CommunityPost[],
  pageSize: number
): FeedCursor | undefined {
  if (lastPage.length < pageSize) return undefined;
  const last = lastPage[lastPage.length - 1];
  return { score: last.score, createdAt: last.created_at, id: last.id };
}

export function useCommunityFeed(enabled = true) {
  const user = useAuthStore((s) => s.user);

  return useInfiniteQuery({
    queryKey: queryKeys.community.feed.of(user?.id),
    queryFn: ({ pageParam }) =>
      getCommunityFeed({
        userId: user!.id,
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: null as FeedCursor | null,
    getNextPageParam: (lastPage) => nextCommunityCursor(lastPage, PAGE_SIZE),
    enabled: !!user && enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
