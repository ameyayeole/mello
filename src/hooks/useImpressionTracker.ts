import { useCallback, useEffect, useRef } from 'react';
import type { ViewToken } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { recordImpressions } from '@/services/community/impressions.service';

const FLUSH_MS = 5000;

// 60% of a card on screen for a full second counts as seen. Lower thresholds
// count posts that merely flew past during a fast scroll.
export const IMPRESSION_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 60,
  minimumViewTime: 1000,
} as const;

/**
 * The buffering half of impression tracking, as a plain factory so it can be
 * driven in a test without a renderer (Reanimated 4 throws on import under
 * Jest, so there are no component tests — see AGENTS.md).
 */
export function createImpressionBuffer(flush: (ids: string[]) => void) {
  let pending = new Set<string>();

  return {
    add(id: string) {
      pending.add(id);
    },
    drain() {
      if (pending.size === 0) return;
      const ids = Array.from(pending);
      pending = new Set();
      flush(ids);
    },
    size() {
      return pending.size;
    },
  };
}

/**
 * Feeds the community FlatList's viewability events into `post_impressions`.
 *
 * Spread the result onto the list. Both returned values are referentially
 * stable on purpose: React Native throws "Changing onViewableItemsChanged on
 * the fly is not supported", and the Community screen re-renders constantly.
 *
 * Flushing deliberately does NOT invalidate the feed query. It is
 * fire-and-forget; invalidating would rebuild the ranked session and reorder
 * the feed under the user's thumb.
 */
export function useImpressionTracker() {
  const bufferRef = useRef(createImpressionBuffer(recordImpressions));

  // Both returned values must be referentially stable (React Native throws
  // "Changing onViewableItemsChanged on the fly is not supported"), so we
  // store stable .current refs.
  // eslint-disable-next-line react-hooks/refs
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      for (const token of viewableItems) {
        const id = (token.item as { id?: string } | undefined)?.id;
        if (token.isViewable && id) bufferRef.current.add(id);
      }
    }
  ).current;

  // eslint-disable-next-line react-hooks/refs
  const viewabilityConfig = useRef(IMPRESSION_VIEWABILITY_CONFIG).current;

  useEffect(() => {
    const buffer = bufferRef.current;
    const timer = setInterval(() => buffer.drain(), FLUSH_MS);
    return () => {
      clearInterval(timer);
      buffer.drain(); // don't lose the tail on unmount
    };
  }, []);

  // Leaving the tab is the strongest "this scroll session is over" signal.
  useFocusEffect(
    useCallback(() => {
      return () => bufferRef.current.drain();
    }, [bufferRef])
  );

  // onViewableItemsChanged and viewabilityConfig are stable refs created above;
  // returning them stable is required (React Native will throw if these props change).
  // eslint-disable-next-line react-hooks/refs
  return { onViewableItemsChanged, viewabilityConfig };
}
