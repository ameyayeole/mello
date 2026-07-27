import { useState } from 'react';

/**
 * The `refreshing` flag for a <RefreshControl>, driven by the *gesture* and
 * nothing else.
 *
 * Every screen used to pass `query.isRefetching` straight through. That is a
 * background-activity flag, not a user-intent one, and the two are not the same
 * thing: the focus effects refetch when a tab regains focus, so the control
 * pulled itself half open and snapped shut on every tab switch — a reload
 * animation for a reload nobody asked for.
 *
 * Owning the flag locally also fixes the opposite failure, which looked
 * unrelated but has the same cause. When a focus refetch was already in flight,
 * `isRefetching` was already true before the gesture began and went false the
 * moment *that* fetch landed — so a real pull frequently showed no spinner at
 * all, or a single frame of one. Here the flag goes up when you pull and comes
 * down when the work you asked for is done.
 *
 * Pass a function that returns a promise for everything the pull should wait
 * on, usually `Promise.all([...])` of the screen's refetches.
 */
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    // A second pull while one is in flight would resolve early and drop the
    // spinner out from under the first.
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return { refreshing, onRefresh };
}
