import { useEffect, useState } from 'react';
import { hasSeenFlag, markFlagSeen } from '@/services/seenFlags';
import { useAuthStore } from '@/stores/authStore';
import { shouldDealWrap } from '@/utils/wrapDeal';
import { useWrap, useWrapEntry } from './useWrap';

// Whether to deal the wrap card on this app open, and how to stop it dealing
// again.
//
// The "already dealt" flag goes through `seenFlags` rather than a new
// SecureStore key: that module already solved key sanitising, per-user
// namespacing and failing open on a keychain read error. A second
// implementation of the same format is the kind of duplication that drifts —
// one side gets a try/catch and the other does not.
const SCOPE = 'wrapDeal';

export function useWrapDeal() {
  const user = useAuthStore((s) => s.user);
  const { data: event } = useWrapEntry();
  const { status } = useWrap(event?.id);

  const [dealt, setDealt] = useState<boolean | null>(null);

  // Depends on the ids, not the objects: both come from React Query, which
  // hands back a new identity on every refetch, and re-running this on each one
  // would re-read the keychain for no reason.
  const userId = user?.id;
  const eventKey = event?.id;
  useEffect(() => {
    if (!userId || !eventKey) return;
    let live = true;
    hasSeenFlag(SCOPE, userId, eventKey).then((seen) => {
      if (live) setDealt(seen);
    });
    return () => {
      live = false;
    };
  }, [userId, eventKey]);

  // `dealt === null` means the flag has not been read yet. Rendering on null
  // would flash the card for anyone who has already dismissed it.
  const ready =
    !!event &&
    !!status &&
    dealt === false &&
    shouldDealWrap({
      hoursSinceEnd: status.hoursSinceEnd,
      alreadyDealt: false,
      // Exact, not inferred. The plan approximated this as
      // `contributorCount > 0 && myPhotoCount > 0` because the gate RPC returns
      // a count rather than your own membership — but 074's select policy lets
      // an attendee read their own wrap_contributions row, so getWrapStatus
      // just asks. See hasContributedToWrap in wrap.service.
      hasContributed: status.iContributed,
    });

  function dismiss() {
    setDealt(true);
    if (userId && eventKey) markFlagSeen(SCOPE, userId, eventKey);
  }

  return { event, ready, dismiss };
}
