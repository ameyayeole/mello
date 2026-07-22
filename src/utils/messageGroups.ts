// How consecutive messages from one person collapse into a run — the
// Instagram/iMessage rule, and the reason a five-message burst shows one
// avatar rather than five.
//
// Pure on purpose: component tests can't run in this repo (Reanimated 4 throws
// on import under Jest), so anything with a rule in it has to be liftable out
// of the view to be testable at all.

// Two messages from the same person more than this far apart read as two
// separate thoughts, not one burst, and get their own avatar and timestamp.
export const RUN_GAP_MS = 5 * 60 * 1000;

// The subset of a Message / DirectMessage this cares about. Both models
// structurally satisfy it, so neither screen has to convert anything.
export interface Groupable {
  sender_id: string;
  created_at: string;
  type?: string;
}

export interface RunFlags {
  isFirstOfRun: boolean;
  isLastOfRun: boolean;
}

// System notices and host announcements are full-width cards, not bubbles —
// one sitting between two messages from the same person splits them.
function isBreaker(m: Groupable): boolean {
  return m.type === 'system' || m.type === 'announcement';
}

function sameRun(a: Groupable | undefined, b: Groupable | undefined): boolean {
  if (!a || !b) return false;
  if (isBreaker(a) || isBreaker(b)) return false;
  if (a.sender_id !== b.sender_id) return false;
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  // NaN from an unparseable timestamp fails this comparison, which breaks the
  // run — the safe direction, since a stray avatar beats a missing one.
  return Math.abs(tb - ta) <= RUN_GAP_MS;
}

/**
 * Where `current` sits in its run, given its neighbours. `prev`/`next` are the
 * adjacent messages in render order (oldest first), or undefined at the ends.
 *
 * Callers decide what to do with it: the avatar goes on the **last** message of
 * a run (that is where the eye lands, and it is what Instagram does), the
 * sender's name on the first.
 */
export function runFlags(
  prev: Groupable | undefined,
  current: Groupable,
  next: Groupable | undefined
): RunFlags {
  return {
    isFirstOfRun: !sameRun(prev, current),
    isLastOfRun: !sameRun(current, next),
  };
}
