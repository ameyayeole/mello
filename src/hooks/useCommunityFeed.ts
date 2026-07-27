import { MutableRefObject } from 'react';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getCommunityFeed, FeedPageParam } from '@/services/community/posts.service';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';

const PAGE_SIZE = 10;

// Tier 1: own + friends + same city + gated cross-city.
// Tier 2: the cross-city gates dropped — any public post, anywhere.
// Tier 3: nothing left to rank; the screen shows the caught-up marker.
export const LAST_TIER = 3;

/**
 * Where to read next. Pagination is an offset into a frozen ranked snapshot
 * (migration 066), not a cursor — a ranking that moves between page fetches
 * duplicates and skips rows silently, which is exactly what the keyset feed did.
 *
 * Three rules that look like details and are not:
 *
 *  - A SHORT PAGE IS NOT THE END. community_feed_page is SECURITY INVOKER, so a
 *    post hidden, deleted or blocked since the snapshot was taken drops out of
 *    its slice. Paging is driven by offset against session_total. The old
 *    `lastPage.length < PAGE_SIZE` heuristic would end the feed at the first
 *    moderated post.
 *
 *  - AN EMPTY PAGE DOES NOT MEAN THE SESSION IS EXHAUSTED. `session_id` and
 *    `session_total` ride on each returned ROW, so a page that comes back
 *    completely empty carries neither — and that is a normal occurrence, not
 *    an error, for the same RLS/moderation reason above. Reading total off
 *    the (missing) row would default it to 0, make `nextOffset < total`
 *    false, and silently advance the tier — skipping the rest of the session.
 *    `FeedPageParam.sessionTotal` exists so the last known total survives an
 *    empty page: it is read off the row when present, and off the previous
 *    page param otherwise.
 *
 *  - AN EMPTY TIER STILL ADVANCES. A viewer with no friends and no city gets an
 *    empty tier 1; ending there is the empty-feed bug the tiers exist to
 *    prevent.
 */
export function nextFeedPage(
  lastPage: CommunityPost[],
  current: FeedPageParam,
  pageSize: number
): FeedPageParam | undefined {
  const sessionId = lastPage[0]?.session_id ?? current.sessionId;
  const sessionTotal = lastPage[0]?.session_total ?? current.sessionTotal ?? 0;
  const nextOffset = current.offset + pageSize;

  if (sessionId && nextOffset < sessionTotal) {
    return { sessionId, tier: current.tier, offset: nextOffset, sessionTotal };
  }
  if (current.tier < LAST_TIER) {
    // A new tier is a new session with its own total, not yet known.
    return { sessionId: null, tier: current.tier + 1, offset: 0, sessionTotal: null };
  }
  return undefined;
}

/**
 * @param pinOwnRef Whether the NEXT session build should float the viewer's own
 *   fresh posts to the top. A **ref**, not state, and read inside `queryFn`
 *   rather than baked into `initialPageParam` — both deliberate:
 *
 *   - `initialPageParam` is a static object, so a value captured there could
 *     never change without remounting the query.
 *   - Pull-to-refresh must set it `false` and trigger the rebuild in the same
 *     tick. A `useState` update would not have landed by the time
 *     `resetQueries` reads the options, so the first refresh would still pin.
 *
 *   Refs are mutable and read at call time, which is exactly the semantics
 *   needed. Posting sets it back to `true` (see the Community screen).
 */
export function useCommunityFeed(
  pinOwnRef?: MutableRefObject<boolean>,
  enabled = true
) {
  const user = useAuthStore((s) => s.user);

  return useInfiniteQuery({
    queryKey: queryKeys.community.feed.of(user?.id),
    queryFn: ({ pageParam }) =>
      getCommunityFeed({
        userId: user!.id,
        page: pageParam,
        pinOwn: pinOwnRef?.current ?? true,
        limit: PAGE_SIZE,
      }),
    initialPageParam: {
      sessionId: null,
      tier: 1,
      offset: 0,
      sessionTotal: null,
    } as FeedPageParam,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      nextFeedPage(lastPage, lastPageParam, PAGE_SIZE),
    enabled: !!user && enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
