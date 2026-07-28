// Kept in its own module, deliberately importing nothing: this repo has no
// component tests (Reanimated 4 throws on import under Jest — see AGENTS.md),
// so the hook that uses this factory is not importable under Jest. Sharing a
// file with it would drag expo-router — and its untranspiled transitive
// dependency standard-navigation — into a test that exercises neither. With
// zero imports here, the test needs no jest.mock() calls and no
// transformIgnorePatterns entry.

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
