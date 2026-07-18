import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { getExploreWraps } from '@/services/wrap.service';
import { useAuthStore } from '@/stores/authStore';

const PAGE_SIZE = 4;

// Wrapped events (public, ended ≤14 days ago, 3+ photos) for the Explore feed.
// Small pages: one wrap card is interleaved after every few event cards, so
// wraps are consumed far slower than events.
export function useExploreWraps() {
  const user = useAuthStore((s) => s.user);

  return useInfiniteQuery({
    queryKey: ['exploreWraps', user?.id],
    queryFn: ({ pageParam }) =>
      getExploreWraps({ limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
    enabled: !!user,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
