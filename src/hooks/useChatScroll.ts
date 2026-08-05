import { useCallback, useMemo } from 'react';
import { FlatList } from 'react-native';

/**
 * The scroll behaviour of a thread — which, now that the list is **inverted**, is
 * almost nothing. That is the point.
 *
 * An inverted list is what every chat app does, and it is the answer to "just
 * open at the last message". The newest message is index 0 and the list is
 * flipped, so scroll offset 0 *is* the bottom of the conversation. The thread
 * therefore opens at the last message because that is where a list starts — no
 * scroll on open, nothing to animate, nothing to correct.
 *
 * What it replaced, and why none of it is missed:
 *
 *   • **The initial `scrollToEnd`.** With a normal list the newest messages are
 *     at the *end*, so opening one meant laying it out and then travelling to the
 *     bottom. Worse, `initialNumToRender` lays out the oldest dozen rows first,
 *     so the first scroll-to-end went to the end of *twelve* messages and parked
 *     forty short of the real bottom. Every fix for that was a scroll you could
 *     see.
 *   • **"Follow new messages only if you were at the bottom."** A new message is
 *     now an insert at index 0, which is below your viewport when you are reading
 *     history: it cannot move the content you are looking at. Being yanked away
 *     mid-sentence is not something to guard against any more, it is structurally
 *     impossible.
 *   • **Re-pinning when the keyboard opens.** The list is anchored at its offset
 *     0 end, so a shorter frame keeps the last message against the composer.
 *
 * `ordered` is the reversed view the list renders. The threads keep their own
 * `messages` oldest-first, because everything else — run grouping, time blocks,
 * read receipts — reads in reading order.
 */
export function useChatScroll<T extends { id: string }>(
  listRef: React.RefObject<FlatList | null>,
  messages: T[]
) {
  // Newest first, for `inverted`. A copy: `reverse` mutates, and the array it
  // would mutate is the one held in the chat hook's state.
  const ordered = useMemo(() => [...messages].slice().reverse(), [messages]);

  /**
   * Back to the newest message. Only needed where something you did should be
   * shown to you — sending while scrolled up into history.
   */
  const scrollToLatest = useCallback(
    (animated = true) => {
      listRef.current?.scrollToOffset({ offset: 0, animated });
    },
    [listRef]
  );

  /**
   * Jump to a specific message — what tapping a reply's quote does. Indexes into
   * the inverted list, so the caller does not have to know the list is reversed.
   */
  const scrollToMessage = useCallback(
    (id: string) => {
      const index = ordered.findIndex((m) => m.id === id);
      if (index < 0) return;
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    },
    [listRef, ordered]
  );

  // Rows are measured as they render, so a row far up the list can be
  // unreachable at the moment `scrollToMessage` asks for it. Falling back to the
  // newest message beats leaving the thread wherever the failed attempt stopped.
  const onScrollToIndexFailed = useCallback(() => {
    scrollToLatest(false);
  }, [scrollToLatest]);

  return { ordered, scrollToLatest, scrollToMessage, onScrollToIndexFailed };
}
