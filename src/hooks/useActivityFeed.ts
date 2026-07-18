import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { getActivityFeed } from '@/services/events.service';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';

const PAGE_SIZE = 20;

// The Explore "Live" feed — a paginated stream of activity moments.
//
// Coordinates are rounded before entering the query key (same reasoning as
// useExploreFeed): the live GPS watcher jitters constantly, and an un-rounded
// key would force a full refetch every time you return to the tab. `enabled`
// lets Explore hold this query back until the Live tab is actually selected, so
// the Discover/Hot tabs don't pay for a feed nobody's looking at.
export function useActivityFeed(enabled = true) {
  const user = useAuthStore((s) => s.user);
  const coords = useLocationStore((s) => s.coords);

  const lat = coords ? Math.round(coords.lat * 100) / 100 : null;
  const lng = coords ? Math.round(coords.lng * 100) / 100 : null;

  return useInfiniteQuery({
    queryKey: ['activityFeed', user?.id, lat, lng],
    queryFn: ({ pageParam }) =>
      getActivityFeed({
        userId: user!.id,
        coords: lat != null && lng != null ? { lat, lng } : null,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
    enabled: !!user && enabled,
    placeholderData: keepPreviousData,
    // Liveness goes stale fast — 30s keeps "happening now" honest without
    // hammering the RPC.
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
