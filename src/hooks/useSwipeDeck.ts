import { useMemo, useState } from 'react';
import { queryKeys } from '@/constants/queryKeys';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  deleteSwipe,
  getExploreFeed,
  getSavedEventIds,
  getSwipedEventIds,
  getTodaySwipeCount,
  recordSwipe,
  saveEvent,
  unsaveEvent,
} from '@/services/events.service';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { CONFIG } from '@/constants/config';
import { isPremium } from '@/utils/premium';
import { ExploreEvent } from '@/types/models';

const PAGE_SIZE = 20;

// "City limits" for the deck: events known to be farther than this never show —
// nobody swipes right on a plan two cities over. ~40 km spans a metro
// (Mumbai tip to tip); events with no distance (location unknown) stay in
// rather than emptying the deck.
export const CITY_LIMIT_M = 40_000;

// The user's wishlisted event ids — shared by every badge (home header, swipe
// screen) and by the deck itself; all consumers hit the same query cache.
export function useSavedEventIds() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: queryKeys.savedEventIds.of(user?.id),
    queryFn: () => getSavedEventIds(user!.id),
    enabled: !!user,
    staleTime: 60_000,
    // Fail fast: badges/deck shouldn't sit behind 3 exponential retries.
    retry: 1,
  });
}

/**
 * Save / unsave one event, optimistically.
 *
 * Lifted out of `useSwipeDeck` when the home screen's bookmark button needed
 * it: the deck's version was identical, and a second copy would have been the
 * fourth thing in this app to drift after being duplicated.
 *
 * The optimistic write is what makes the bookmark feel instant, and it is also
 * the part that fails silently when it's wrong — `tsc` cannot see a cache key
 * that no longer matches. Both keys come from `queryKeys`.
 */
export function useSaveEvent() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, save }: { eventId: string; save: boolean }) =>
      save ? saveEvent(user!.id, eventId) : unsaveEvent(user!.id, eventId),
    onMutate: async ({ eventId, save }) => {
      // Cancel first. A refetch already on the wire will otherwise land *after*
      // this write and overwrite it — the bookmark fills in, then empties again
      // a moment later on a slow connection. Same bug CLEANUP.md §1 records for
      // join/leave.
      await queryClient.cancelQueries({
        queryKey: queryKeys.savedEventIds.of(user?.id),
      });
      const previous = queryClient.getQueryData<string[]>(
        queryKeys.savedEventIds.of(user?.id)
      );
      queryClient.setQueryData<string[]>(
        queryKeys.savedEventIds.of(user?.id),
        (ids = []) =>
          save
            ? ids.includes(eventId)
              ? ids
              : [...ids, eventId]
            : ids.filter((i) => i !== eventId)
      );
      return { previous };
    },
    onError: (_e, _vars, context) => {
      if (context?.previous === undefined) return;
      queryClient.setQueryData(
        queryKeys.savedEventIds.of(user?.id),
        context.previous
      );
    },
    onSettled: () => {
      // The wishlist page/profile show full rows; refresh after any toggle.
      queryClient.invalidateQueries({
        queryKey: queryKeys.savedEvents.of(user?.id),
      });
    },
  });
}

// The swipeable event deck: the ranked explore_feed (interest match, proximity,
// friends going, starts-soon — i.e. "most likely to join" first), minus events
// the user already swiped, hosts, or that sit outside the city limits.
//
// A right-swipe both records the like AND saves the event to the wishlist.
// Undo pops the last swipe of this session: the card returns to the top of the
// deck (its ranked slot), and a liked event is unsaved again.
//
// Swipes and saves update the id caches optimistically, and a failed
// recordSwipe (e.g. migration 022 not applied yet) is deliberately NOT rolled
// back: the card stays dismissed for this session instead of resurfacing
// mid-deck.
export function useSwipeDeck() {
  const user = useAuthStore((s) => s.user);
  const coords = useLocationStore((s) => s.coords);
  const queryClient = useQueryClient();

  // This session's swipes, newest last — the undo stack.
  const [history, setHistory] = useState<
    { eventId: string; direction: 'like' | 'pass' }[]
  >([]);

  // Rounded ~1 km like useExploreFeed, so GPS jitter never refetches the deck.
  const lat = coords ? Math.round(coords.lat * 100) / 100 : null;
  const lng = coords ? Math.round(coords.lng * 100) / 100 : null;

  const feed = useInfiniteQuery({
    queryKey: queryKeys.swipeDeck.of(user?.id, lat, lng),
    queryFn: ({ pageParam }) =>
      getExploreFeed({
        userId: user!.id,
        coords: lat != null && lng != null ? { lat, lng } : null,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const swipedQuery = useQuery({
    queryKey: ['swipedEventIds', user?.id],
    queryFn: () => getSwipedEventIds(user!.id),
    enabled: !!user,
    staleTime: 60_000,
    // Fail fast: the deck's isLoading waits on this query.
    retry: 1,
  });

  const savedQuery = useSavedEventIds();

  // Mello+ swipe cap: free users get CONFIG.freeDailySwipes per day (the DB
  // trigger from migration 024 is the source of truth; this mirrors it for
  // the UI). Undo refunds a swipe.
  const premium = isPremium(user);
  const swipeCountQuery = useQuery({
    queryKey: ['todaySwipes', user?.id],
    queryFn: () => getTodaySwipeCount(user!.id),
    enabled: !!user && !premium,
    staleTime: 60_000,
    retry: 1,
  });
  const swipesLeft = premium
    ? Infinity
    : Math.max(0, CONFIG.freeDailySwipes - (swipeCountQuery.data ?? 0));

  const bumpTodaySwipes = (delta: number) => {
    queryClient.setQueryData<number>(
      ['todaySwipes', user?.id],
      (n = 0) => Math.max(0, n + delta)
    );
  };

  const swipedIds = swipedQuery.data;
  const deck: ExploreEvent[] = useMemo(() => {
    const swiped = new Set(swipedIds ?? []);
    const seen = new Set<string>();
    return (feed.data?.pages.flat() ?? []).filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      if (swiped.has(e.id)) return false;
      if (e.host_id === user?.id) return false;
      if (e.distance_m != null && e.distance_m > CITY_LIMIT_M) return false;
      return true;
    });
  }, [feed.data, swipedIds, user?.id]);

  const setSwipedCache = (mutate: (ids: string[]) => string[]) => {
    queryClient.setQueryData<string[]>(
      ['swipedEventIds', user?.id],
      (ids = []) => mutate(ids)
    );
  };

  const swipeMutation = useMutation({
    mutationFn: ({
      eventId,
      direction,
    }: {
      eventId: string;
      direction: 'like' | 'pass';
    }) => recordSwipe(user!.id, eventId, direction),
    onMutate: ({ eventId }) => {
      setSwipedCache((ids) =>
        ids.includes(eventId) ? ids : [...ids, eventId]
      );
    },
    onError: (e) => {
      console.warn('recordSwipe failed:', e);
      // The DB trigger may have rejected the swipe (daily cap) — resync.
      queryClient.invalidateQueries({ queryKey: ['todaySwipes', user?.id] });
    },
  });

  const saveMutation = useSaveEvent();

  const swipe = (eventId: string, direction: 'like' | 'pass') => {
    setHistory((h) => [...h, { eventId, direction }]);
    bumpTodaySwipes(1);
    swipeMutation.mutate({ eventId, direction });
    // Liking = wanting to come back to it: straight onto the wishlist.
    if (direction === 'like') saveMutation.mutate({ eventId, save: true });
  };

  // Returns the undone swipe (for feedback copy), or null when there's nothing
  // to undo. The card comes back at the top since deck order is unchanged.
  const undo = (): { eventId: string; direction: 'like' | 'pass' } | null => {
    const last = history[history.length - 1];
    if (!last) return null;
    setHistory((h) => h.slice(0, -1));
    setSwipedCache((ids) => ids.filter((i) => i !== last.eventId));
    bumpTodaySwipes(-1);
    deleteSwipe(user!.id, last.eventId).catch((e) =>
      console.warn('deleteSwipe failed:', e)
    );
    if (last.direction === 'like') {
      saveMutation.mutate({ eventId: last.eventId, save: false });
    }
    return last;
  };

  return {
    deck,
    // Wait for the swiped ids too, or already-judged cards flash then vanish.
    isLoading: feed.isLoading || swipedQuery.isLoading,
    isError: feed.isError,
    refetch: feed.refetch,
    fetchNextPage: feed.fetchNextPage,
    hasNextPage: feed.hasNextPage,
    isFetchingNextPage: feed.isFetchingNextPage,
    savedIds: new Set(savedQuery.data ?? []),
    swipe,
    undo,
    canUndo: history.length > 0,
    premium,
    swipesLeft,
    outOfSwipes: !premium && swipesLeft <= 0,
    toggleSave: (eventId: string, save: boolean) =>
      saveMutation.mutate({ eventId, save }),
  };
}
