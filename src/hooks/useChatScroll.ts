import { useCallback, useRef } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * Where a thread opens, and when it follows along afterwards.
 *
 * Three rules, and they were one line before this — `onContentSizeChange` ran
 * `scrollToEnd({ animated: true })` every time, which got all three wrong:
 *
 *   **It opens at the bottom, instantly.** Animating the first scroll meant
 *   watching the thread race past you from the top on every open. You should
 *   arrive where the conversation is, not travel there.
 *
 *   **Unless something is unread, in which case it opens there.** Landing at
 *   the bottom of ten unread messages means scrolling back up to find where
 *   you stopped. The first unread message goes to the top of the screen with
 *   what came before it still visible above.
 *
 *   **It only follows new messages if you were already at the bottom.** Being
 *   yanked away mid-sentence because someone else posted is the single most
 *   irritating thing a chat can do.
 */
// Close enough to the bottom that you were plainly reading the live end of the
// conversation rather than history. One bubble's worth.
const AT_BOTTOM_SLOP = 90;

export function useChatScroll(
  listRef: React.RefObject<FlatList | null>,
  // Index of the first message the viewer hasn't read, or null for none.
  // Captured by the caller *once*, before opening the chat marks it read.
  //
  // A ref rather than a value: it is written after the first messages land and
  // read when the list reports its size, and passing the number itself would
  // mean reading a ref during render — which the compiler rejects, rightly.
  firstUnreadIndex: React.RefObject<number | null>
) {
  const landed = useRef(false);
  const atBottom = useRef(true);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      atBottom.current =
        contentSize.height - contentOffset.y - layoutMeasurement.height <
        AT_BOTTOM_SLOP;
    },
    []
  );

  const onContentSizeChange = useCallback(() => {
    const list = listRef.current;
    if (!list) return;

    if (!landed.current) {
      landed.current = true;
      const anchor = firstUnreadIndex.current;
      if (anchor != null && anchor > 0) {
        // viewPosition 0 puts it at the top of the viewport, so the messages
        // you already read stay above it and the new ones read downward.
        list.scrollToIndex({ index: anchor, animated: false, viewPosition: 0 });
      } else {
        list.scrollToEnd({ animated: false });
      }
      return;
    }

    if (atBottom.current) list.scrollToEnd({ animated: true });
  }, [listRef, firstUnreadIndex]);

  // Rows are measured as they render, so an index far down the list can be
  // unreachable at the moment we ask for it. Fall back to the bottom rather
  // than leaving the thread parked at the top.
  const onScrollToIndexFailed = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: false });
  }, [listRef]);

  return { onScroll, onContentSizeChange, onScrollToIndexFailed };
}
