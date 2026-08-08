import { WrapStatus } from '@/types/models';
import { wrapStepsDone, wrapStepTotal } from '@/hooks/useWrap';

// After this long, someone who finished their own steps can open the recap even
// though the group never reached the threshold.
//
// Without this escape hatch a three-person event where the other two never
// reopen the app locks the recap PERMANENTLY for the one person who did
// everything — punished for participating. That is the likeliest way this
// feature fails in the wild.
//
// This is NOT the contribution window. Contributing stays open for seven days
// (`wrap_window_open`, migration 032), so the count can still cross the
// threshold on day four and open the wrap the honest way.
export const FORCE_UNLOCK_AFTER_HOURS = 48;

export type WrapGateState =
  | 'locked' // waiting on other people
  | 'unlockable' // 48h passed, the group never arrived, you may open it anyway
  | 'open'; // the group showed up

// Whether the recap is available, and if not, why not.
//
// Deliberately does NOT compute the threshold: `contributorsNeeded` comes from
// `get_wrap_gate` (migration 075). If this recomputed it, two app versions could
// disagree about whether a wrap is unlocked.
export function wrapGateState(
  status: WrapStatus | undefined
): WrapGateState {
  if (!status) return 'locked';

  // Your own steps are the price of entry either way — the escape hatch is for
  // a quiet group, not for skipping your own contribution.
  const mine = wrapStepsDone(status) >= wrapStepTotal(status);
  if (!mine) return 'locked';

  if (status.contributorCount >= status.contributorsNeeded) return 'open';
  if (status.hoursSinceEnd > FORCE_UNLOCK_AFTER_HOURS) return 'unlockable';
  return 'locked';
}
