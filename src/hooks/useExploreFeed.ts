import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { getExploreFeed } from '@/services/events.service';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { useUIStore } from '@/stores/uiStore';

const PAGE_SIZE = 10;

// Ranked, paginated Explore feed.
//
// Proximity is only a soft ranking signal, so we round the coordinates before
// they enter the query key. Without this, the live location watcher (started by
// the Map tab) pushes a fresh GPS reading on every jitter, which would change
// the key and force a full refetch each time you return to this tab — the cause
// of the "loads, then shows empty" flash. Rounding to ~2 decimals (~1 km) keeps
// the key stable, and keepPreviousData keeps the current feed on screen while a
// genuinely-new query (e.g. a filter change) loads in the background.
export function useExploreFeed() {
  const user = useAuthStore((s) => s.user);
  const coords = useLocationStore((s) => s.coords);
  const activeFilter = useUIStore((s) => s.activeFilter);

  const lat = coords ? Math.round(coords.lat * 100) / 100 : null;
  const lng = coords ? Math.round(coords.lng * 100) / 100 : null;

  return useInfiniteQuery({
    queryKey: ['exploreFeed', user?.id, lat, lng, activeFilter],
    queryFn: ({ pageParam }) =>
      getExploreFeed({
        userId: user!.id,
        coords: lat != null && lng != null ? { lat, lng } : null,
        activity: activeFilter ?? undefined,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    // Stop paging once a page comes back short (no more rows).
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
    enabled: !!user,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
