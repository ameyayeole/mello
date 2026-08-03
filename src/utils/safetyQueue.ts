import type { EventDetail } from '@/types/models';
import { safetyFlagsFor, safetyPopup, type QueuedSafetyPopup } from './eventCardGates';

// The pre-join safety queue's state transitions, pulled out of
// `useEventCard` so they can be driven directly in a test the way
// `participationMutations` is — no renderer, no hook, just plain functions
// over plain data. `useEventCard` owns the one impure step (the
// `hasSeenSafetyFlag`/`markSafetyFlagSeen` SecureStore reads/writes) and
// calls these for everything else.
//
// Contract, lifted from `EventBottomSheet.tsx:1030-1042`: building the queue
// filters to flags not yet seen, in `safetyFlagsFor`'s fixed order
// (first_join first); confirming the head marks it seen and pops it; the
// join fires only once the queue is empty — never before, and never on a
// dismiss, which clears the queue outright.

// The queue to open a join with, given which flags this user has already
// seen. Empty when every flag this event raises has already been seen (or it
// raises none), which is the caller's cue to join immediately with no popup.
export function buildSafetyQueue(
  event: EventDetail,
  seenFlags: ReadonlySet<string>
): QueuedSafetyPopup[] {
  return safetyFlagsFor(event)
    .filter((flag) => !seenFlags.has(flag))
    .map((flag) => safetyPopup(flag, event))
    .filter((popup): popup is QueuedSafetyPopup => popup !== null);
}

// One popup confirmed. `seenFlag` is what the caller must persist (via
// `markSafetyFlagSeen`); `queue` is what's left; `join` is true only once
// nothing is left — the single place this contract is decided.
export interface SafetyQueueStep {
  seenFlag: string | null;
  queue: QueuedSafetyPopup[];
  join: boolean;
}

export function confirmSafetyQueue(
  queue: readonly QueuedSafetyPopup[]
): SafetyQueueStep {
  const [head, ...rest] = queue;
  return { seenFlag: head?.flag ?? null, queue: rest, join: rest.length === 0 };
}

// Dismissing (backdrop tap / close) cancels the join outright — never a
// partial confirm, never a join.
export function dismissSafetyQueue(): SafetyQueueStep {
  return { seenFlag: null, queue: [], join: false };
}
