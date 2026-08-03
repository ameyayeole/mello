import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearEventDraft,
  loadEventDraft,
  saveEventDraft,
} from '@/services/eventDraftStore';
import {
  draftInputFrom,
  useCreateEventStore,
} from '@/stores/createEventStore';

// How long after the last change to write. Long enough that typing a title does
// not hit the keychain per character, short enough to survive a swipe-away.
const AUTOSAVE_MS = 600;

// Restore-on-entry and debounced autosave for the create wizard.
//
// The autosave is a store subscription rather than an effect over the draft
// fields. As an effect it needed all sixteen of them in its dependency array,
// which meant the component had to subscribe to all sixteen to feed it — the
// exact coupling the store exists to remove. Subscribing directly means the
// flow re-renders for none of them and the save still sees every change.
export function useDraftPersistence({
  active,
  userId,
  onRestoredCoord,
}: {
  active: boolean;
  userId: string | undefined;
  // Called when a restored draft got as far as a pin. Without a coordinate
  // there is nothing to hang the form on, so that draft resumes at the drop
  // prompt with its fields already filled — which is why this is a callback
  // rather than something the hook decides.
  onRestoredCoord: (coord: { lat: number; lng: number }) => void;
}) {
  // True while the current form came back from storage rather than being
  // started here — drives the "draft restored" affordance.
  const [restored, setRestored] = useState(false);
  // Autosave must not run until the restore has had its turn. Otherwise the
  // debounced save of the still-blank form can beat a slow keychain read, find
  // no work, and clear the very draft that is about to be restored.
  const [loaded, setLoaded] = useState(false);

  // Held in a ref so the identity below stays stable for the subscription.
  const onCoord = useRef(onRestoredCoord);
  onCoord.current = onRestoredCoord;

  useEffect(() => {
    if (!active) return;
    setRestored(false);
    setLoaded(false);
    if (!userId) {
      setLoaded(true);
      return;
    }

    // Guards against a draft landing after the user has already left, or after
    // they hit "start fresh" while the read was in flight.
    let cancelled = false;
    loadEventDraft(userId).then((d) => {
      if (cancelled) return;
      // Arms autosave either way — a miss is as conclusive as a hit.
      setLoaded(true);
      if (!d) return;
      useCreateEventStore.getState().hydrate(d);
      setRestored(true);
      if (d.coord) onCoord.current(d.coord);
    });
    return () => {
      cancelled = true;
    };
  }, [active, userId]);

  useEffect(() => {
    if (!active || !userId || !loaded) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useCreateEventStore.subscribe((state) => {
      // Skipped once submitting: from that point the event either exists (and
      // the draft is cleared) or failed (and the form is still standing, so the
      // next edit saves it again).
      if (state.phase === 'submit') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveEventDraft(userId, draftInputFrom(state));
      }, AUTOSAVE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [active, userId, loaded]);

  // Throws the stored draft away and blanks the form. Used by "start fresh" and
  // by the discard confirm.
  const discard = useCallback(() => {
    if (userId) clearEventDraft(userId);
    useCreateEventStore.getState().reset();
    setRestored(false);
  }, [userId]);

  return { restored, discard };
}
