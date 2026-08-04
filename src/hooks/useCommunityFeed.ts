import { MutableRefObject } from 'react';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getCommunityFeed, FeedPageParam } from '@/services/community/posts.service';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';

const PAGE_SIZE = 10;

// Tier 1: own + friends + same city + gated cross-city.
// Tier 2: the cross-city gates dropped — any public post, anywhere.
//
// These are the only two SERVER tiers (069_feed_tiers.sql's pool predicate is
// `p_tier >= 2`, so there is no distinct rung above 2 to query). "Caught up"
// is a CLIENT state, not a third tier: once tier 2 is exhausted there is
// nothing left to rank, and the screen shows the events rail plus the
// caught-up marker instead of issuing another request.
export const LAST_TIER = 2;

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
 * Whether the next session build should float the viewer's own fresh post to
 * the top. Module-level because the two things that write it now live on
 * different screens: the composer is its own route, so it can no longer hand a
 * callback back to the feed the way a sheet mounted inside it could.
 *
 * A plain mutable object rather than store state, for the reason spelled out
 * on `pinOwnRef` below — it is read inside `queryFn` at call time, and the
 * write has to be visible to a rebuild triggered in the same tick.
 */
export const pinOwnPosts = { current: true };

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
