import { Alert } from 'react-native';
import {
  useMutation,
  useQueryClient,
  QueryClient,
  UseMutationOptions,
} from '@tanstack/react-query';
import {
  joinEvent,
  leaveEvent,
  approveParticipant,
  rejectParticipant,
} from '@/services/events.service';
import {
  scheduleEventSafetyReminder,
  cancelEventSafetyReminder,
} from '@/services/reminders';
import { queryKeys } from '@/constants/queryKeys';
import { EventDetail, ParticipantStatus, Profile } from '@/types/models';

// The four participation mutations for one event: join, leave, and the host's
// approve/reject. All optimistic — the button label, the participant list and
// the going-count update the instant a button is tapped, then reconcile.
//
// These lived as four near-identical copies inside EventBottomSheet, and the
// copies had already diverged: the wishlist mutation next to them cancels
// in-flight queries before snapshotting and these four did not, so a refetch
// already on the wire could land *after* the optimistic write and overwrite it.
// The symptom was a Join button that flipped to "Going" and then snapped back
// on a slow connection. Sharing one implementation fixes that by construction.

type Ctx = { prev: EventDetail | undefined };

// The options are built separately from the hook so they can be exercised
// against a bare QueryClient in tests — the behaviour worth pinning down here
// is cache bookkeeping, and involving a renderer to reach it buys nothing.
export function participationMutations(
  qc: QueryClient,
  eventId: string | null,
  user: Profile | null,
  event: EventDetail | undefined
) {
  const detailKey = queryKeys.eventDetail.of(eventId);

  const invalidate = () => qc.invalidateQueries({ queryKey: detailKey });

  // Snapshot for rollback. Cancelling first is the part the copies missed: an
  // in-flight refetch resolving later would otherwise clobber what we write.
  const snapshot = async (): Promise<Ctx> => {
    await qc.cancelQueries({ queryKey: detailKey });
    return { prev: qc.getQueryData<EventDetail>(detailKey) };
  };

  const rollback = (ctx: Ctx | undefined) => {
    if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
  };

  // Both patches recompute participant_count from the list rather than
  // incrementing it, so the count can't drift out of step with the roster.
  const writeParticipants = (
    next: (participants: EventDetail['participants']) => EventDetail['participants']
  ) => {
    qc.setQueryData<EventDetail>(detailKey, (prev) => {
      if (!prev) return prev;
      const participants = next(prev.participants);
      return {
        ...prev,
        participants,
        participant_count: participants.filter((p) => p.status === 'approved')
          .length,
      };
    });
  };

  const setMyParticipation = (status: ParticipantStatus | null) => {
    if (!user) return;
    writeParticipants((participants) => {
      const others = participants.filter((p) => p.id !== user.id);
      return status ? [...others, { ...user, status }] : others;
    });
  };

  const patchParticipant = (uid: string, status: ParticipantStatus | null) => {
    writeParticipants((participants) =>
      status === null
        ? participants.filter((p) => p.id !== uid)
        : participants.map((p) => (p.id === uid ? { ...p, status } : p))
    );
  };

  const join: UseMutationOptions<void, Error, void, Ctx> = {
    mutationFn: () => joinEvent(event!.id, user!.id, event!.requires_approval),
    onMutate: async () => {
      const ctx = await snapshot();
      setMyParticipation(event!.requires_approval ? 'pending' : 'approved');
      return ctx;
    },
    onError: (_e, _v, ctx) => {
      rollback(ctx);
      Alert.alert(
        "Couldn't join",
        'Please check your connection and try again.'
      );
    },
    onSuccess: () => {
      // Pre-event safety reminder (#4). Pending requests get no reminder — the
      // host may never approve them.
      if (event && !event.requires_approval) scheduleEventSafetyReminder(event);
    },
    onSettled: invalidate,
  };

  const leave: UseMutationOptions<void, Error, void, Ctx> = {
    mutationFn: () => leaveEvent(event!.id, user!.id),
    onMutate: async () => {
      const ctx = await snapshot();
      setMyParticipation(null);
      return ctx;
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSuccess: () => {
      if (event) cancelEventSafetyReminder(event.id);
    },
    onSettled: invalidate,
  };

  const approve: UseMutationOptions<void, Error, string, Ctx> = {
    mutationFn: (uid: string) => approveParticipant(event!.id, uid),
    onMutate: async (uid: string) => {
      const ctx = await snapshot();
      patchParticipant(uid, 'approved');
      return ctx;
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: invalidate,
  };

  const reject: UseMutationOptions<void, Error, string, Ctx> = {
    mutationFn: (uid: string) => rejectParticipant(event!.id, uid),
    onMutate: async (uid: string) => {
      const ctx = await snapshot();
      patchParticipant(uid, null);
      return ctx;
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: invalidate,
  };

  return { join, leave, approve, reject };
}

export function useEventParticipation(
  eventId: string | null,
  user: Profile | null,
  event: EventDetail | undefined
) {
  const qc = useQueryClient();
  const options = participationMutations(qc, eventId, user, event);
  return {
    join: useMutation(options.join),
    leave: useMutation(options.leave),
    approve: useMutation(options.approve),
    reject: useMutation(options.reject),
  };
}
