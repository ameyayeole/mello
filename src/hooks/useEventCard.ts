import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getEventDetail, getEventDistanceM } from '@/services/events.service';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { useUIStore } from '@/stores/uiStore';
import { isPremium } from '@/utils/premium';
import { hasWrapped } from '@/services/wrap.service';
import { useEventParticipation } from '@/hooks/useEventParticipation';
import { useSaveEvent, useSavedEventIds } from '@/hooks/useSwipeDeck';
import { hasSeenSafetyFlag, markSafetyFlagSeen } from '@/services/safety';
import {
  joinGate,
  safetyFlagsFor,
  safetyPopup,
  type QueuedSafetyPopup,
} from '@/utils/eventCardGates';

// One event's worth of state for the dealt card's top (interactive) face:
// the fetched detail, the join gate, the primary action, the pre-join safety
// queue and the wishlist toggle. Everything here composes existing pieces —
// `useEventParticipation` for the mutations, `eventCardGates` for the pure
// gate/queue logic — rather than re-implementing any of them.
//
// Ported from EventBottomSheet's per-event state (that file computed all of
// this inline); this is the same logic, pulled out so the dealt card can use
// it without dragging the sheet's gorhom/snap-point machinery along.
export function useEventCard(eventId: string | null) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const closeDealtCard = useUIStore((s) => s.closeDealtCard);

  const { data: event, isLoading } = useQuery({
    queryKey: queryKeys.eventDetail.of(eventId),
    queryFn: () => getEventDetail(eventId!),
    enabled: !!eventId,
  });

  // Distance user↔event for the Mello+ >10 km join gate. Fails soft to "no
  // gate" when location is off — same as the sheet's version of this query.
  const coords = useLocationStore((s) => s.coords);
  const { data: gateDistanceM } = useQuery({
    queryKey: ['eventDistance', eventId],
    queryFn: () => getEventDistanceM(eventId!, coords!),
    enabled: !!eventId && !!coords,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const premium = isPremium(user);
  const isHost = event?.host_id === user?.id;
  const myStatus = event?.participants?.find((p) => p.id === user?.id)?.status;
  const isParticipant = myStatus === 'approved';
  const isPending = myStatus === 'pending';

  const gate = event
    ? joinGate({
        event,
        isHost,
        isParticipant,
        isPending,
        premium,
        distanceM: gateDistanceM ?? null,
        viewerGender: user?.gender ?? undefined,
      })
    : 'none';

  const { join, leave } = useEventParticipation(eventId, user ?? null, event);

  // ─── Pre-join safety queue (#3 first join, #10 women-only, #5 new host,
  //     #8 party/alcohol) — lifted verbatim from
  //     EventBottomSheet.tsx:1030-1042. Confirming the current popup marks it
  //     seen and pops the queue; the join fires only once the queue is empty.
  //     Dismissing clears the queue and cancels the join outright.
  const [queue, setQueue] = useState<QueuedSafetyPopup[]>([]);

  const startJoin = useCallback(async () => {
    if (!event || !user) return;
    const unseen: QueuedSafetyPopup[] = [];
    for (const flag of safetyFlagsFor(event)) {
      if (await hasSeenSafetyFlag(user.id, flag)) continue;
      const popup = safetyPopup(flag, event);
      if (popup) unseen.push(popup);
    }
    if (unseen.length > 0) setQueue(unseen);
    else join.mutate();
  }, [event, user, join]);

  // Reads `queue` directly rather than via a `setQueue` updater — the join
  // fire is a side effect, and a state updater is expected to stay pure (React
  // may invoke it more than once to check that). Mirrors the original
  // `confirmQueuedPopup`, which reads `joinQueue[0]` the same way.
  const confirmQueued = useCallback(() => {
    const [head, ...rest] = queue;
    if (head && user) markSafetyFlagSeen(user.id, head.flag);
    setQueue(rest);
    if (rest.length === 0) join.mutate();
  }, [queue, join, user]);

  const dismissQueue = useCallback(() => setQueue([]), []);

  // ─── Wishlist toggle for the bookmark chip on the front face ────────────────
  const { data: savedIds } = useSavedEventIds();
  const saved = !!eventId && !!savedIds?.includes(eventId);
  const saveMutation = useSaveEvent();
  const toggleSave = useCallback(() => {
    if (!eventId) return;
    saveMutation.mutate({ eventId, save: !saved });
  }, [eventId, saved, saveMutation]);

  // ─── The single primary action — same state machine as the sheet's
  //     `primaryAction` (wrap / manage / open chat / join), collapsed to one
  //     label + one handler since the dealt card has one CTA slot, not a
  //     footer that swaps components. Navigational outcomes close the deck
  //     first (there is nothing to come back to mid-navigation).
  const wrapped = !!event && hasWrapped(event);

  const primaryLabel = !event
    ? ''
    : wrapped && (isParticipant || isHost)
      ? 'Open the event wrap'
      : wrapped
        ? ''
        : isHost
          ? 'Manage event'
          : isParticipant
            ? 'Open chat'
            : isPending
              ? 'Request pending'
              : gate === 'womenOnly'
                ? 'Female-only event'
                : gate === 'full'
                  ? 'Event full'
                  : gate === 'premiumDistance'
                    ? 'Join with Mello+'
                    : gate === 'request'
                      ? 'Request to join'
                      : 'Join event';

  const onPrimary = useCallback(() => {
    if (!event) return;
    if (wrapped && (isParticipant || isHost)) {
      closeDealtCard();
      router.push(`/events/wrap/${event.id}`);
      return;
    }
    if (wrapped) return;
    if (isHost) {
      closeDealtCard();
      router.push(`/events/host/${event.id}`);
      return;
    }
    if (isParticipant) {
      closeDealtCard();
      router.push(`/(tabs)/chats/${event.id}`);
      return;
    }
    if (isPending) {
      leave.mutate();
      return;
    }
    if (gate === 'premiumDistance') {
      closeDealtCard();
      router.push('/premium?reason=distance');
      return;
    }
    if (gate === 'full' || gate === 'womenOnly') return;
    startJoin();
  }, [
    event,
    wrapped,
    isHost,
    isParticipant,
    isPending,
    gate,
    leave,
    router,
    closeDealtCard,
    startJoin,
  ]);

  return {
    event,
    isLoading,
    gate,
    primaryLabel,
    onPrimary,
    queue,
    confirmQueued,
    dismissQueue,
    saved,
    toggleSave,
    leave,
  };
}
