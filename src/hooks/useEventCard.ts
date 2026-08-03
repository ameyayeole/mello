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
  buildSafetyQueue,
  confirmSafetyQueue,
  dismissSafetyQueue,
} from '@/utils/safetyQueue';
import { joinGate, safetyFlagsFor, type QueuedSafetyPopup } from '@/utils/eventCardGates';

// Copied verbatim from EventBottomSheet.tsx — these strings are written to
// `event_leave_feedback` as-is, so a rewording here would silently change
// what's stored for every leave from this point on.
export const LEAVE_REASONS = [
  "Can't make it anymore",
  'My plans changed',
  'Not comfortable / feels unsafe',
  'Something else',
] as const;

// One event's worth of state for the dealt card's top (interactive) face:
// the fetched detail, the join gate, the primary action, the pre-join safety
// queue, the leave flow, the host's approve/reject rows and the wishlist
// toggle. Everything here composes existing pieces — `useEventParticipation`
// for the mutations, `eventCardGates`/`safetyQueue` for the pure gate/queue
// logic — rather than re-implementing any of them.
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

  const {
    join,
    leave: leaveMutation,
    approve,
    reject,
  } = useEventParticipation(eventId, user ?? null, event);

  // Mello+ members' requests surface first for the host — same sort
  // EventBottomSheet.tsx:897-899 used.
  const pending = (event?.participants ?? [])
    .filter((p) => p.status === 'pending')
    .sort((a, b) => Number(isPremium(b)) - Number(isPremium(a)));

  // ─── Pre-join safety queue (#3 first join, #10 women-only, #5 new host,
  //     #8 party/alcohol). The state transitions (build/confirm/dismiss) are
  //     pure and live in `safetyQueue.ts`, tested there directly; this hook
  //     owns only the impure step — the SecureStore seen-flag reads/writes —
  //     and the join mutation itself. Confirming the current popup marks it
  //     seen and pops the queue; the join fires only once the queue is
  //     empty. Dismissing clears the queue and cancels the join outright.
  const [queue, setQueue] = useState<QueuedSafetyPopup[]>([]);

  const startJoin = useCallback(async () => {
    if (!event || !user) return;
    const seen = new Set<string>();
    for (const flag of safetyFlagsFor(event)) {
      if (await hasSeenSafetyFlag(user.id, flag)) seen.add(flag);
    }
    const next = buildSafetyQueue(event, seen);
    setQueue(next);
    if (next.length === 0) join.mutate();
  }, [event, user, join]);

  const confirmQueued = useCallback(() => {
    const step = confirmSafetyQueue(queue);
    if (step.seenFlag && user) markSafetyFlagSeen(user.id, step.seenFlag);
    setQueue(step.queue);
    if (step.join) join.mutate();
  }, [queue, join, user]);

  const dismissQueue = useCallback(() => {
    setQueue(dismissSafetyQueue().queue);
  }, []);

  // ─── Leave flow: confirm → reason, ported from EventBottomSheet.tsx's
  //     `leaveStep`/`leaveReason`/`leaveDetail`/`confirmLeave`. The reason
  //     (one of `LEAVE_REASONS`, plus optional free text) is recorded in
  //     `event_leave_feedback` — `leaveEvent()` only inserts a feedback row
  //     when a reason is present (events.service.ts:307), so skipping this
  //     flow and calling `leaveMutation.mutate()` bare (as the pending-request
  //     cancel path below does, deliberately — there's no membership to leave
  //     feedback about) would silently drop that row for a real leave too.
  const [leaveStep, setLeaveStep] = useState<'idle' | 'confirm' | 'reason'>(
    'idle'
  );
  const [leaveReason, setLeaveReason] = useState<string | null>(null);
  const [leaveDetail, setLeaveDetail] = useState('');

  const resetLeaveFlow = useCallback(() => {
    setLeaveStep('idle');
    setLeaveReason(null);
    setLeaveDetail('');
  }, []);

  const confirmLeave = useCallback(() => {
    if (!leaveReason) return;
    leaveMutation.mutate({
      reason: leaveReason,
      detail: leaveDetail.trim() || undefined,
    });
    resetLeaveFlow();
  }, [leaveReason, leaveDetail, leaveMutation, resetLeaveFlow]);

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
      // Withdrawing a request, not leaving a membership — no feedback row to
      // record (there's nothing to leave feedback about), so this bypasses
      // the reason flow on purpose. Same as EventBottomSheet's primary
      // button: `onPress={() => (isPending ? leave.mutate() : ...)}`.
      leaveMutation.mutate();
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
    leaveMutation,
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
    isHost,
    pending,
    approve,
    reject,
    leave: {
      isPending: leaveMutation.isPending,
      step: leaveStep,
      reason: leaveReason,
      detail: leaveDetail,
      start: () => setLeaveStep('confirm'),
      stay: resetLeaveFlow,
      proceedToReason: () => setLeaveStep('reason'),
      setReason: setLeaveReason,
      setDetail: setLeaveDetail,
      confirm: confirmLeave,
    },
  };
}
