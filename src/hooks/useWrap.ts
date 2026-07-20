import { useEffect, useRef } from 'react';
import { queryKeys } from '@/constants/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  bumpWrapView,
  getLatestWrappableEvent,
  getWrapStatus,
  getWrapSummary,
  requestEncore,
  submitEventFeedback,
  voteSuperlative,
  withdrawEncore,
} from '@/services/wrap.service';
import { useAuthStore } from '@/stores/authStore';
import { SuperlativeCategory, WrapStatus } from '@/types/models';

// The number of checklist steps a non-host attendee sees (host skips the
// "rate the event" step, so theirs is 3).
export function wrapStepTotal(status: WrapStatus | undefined): number {
  return status?.isHost ? 3 : 4;
}

export function wrapStepsDone(status: WrapStatus | undefined): number {
  if (!status) return 0;
  let done = 0;
  if (status.coAttendeeCount > 0 && status.ratedCount >= status.coAttendeeCount)
    done += 1;
  if (status.myPhotoCount > 0) done += 1;
  if (status.votedCategories.length >= 4) done += 1;
  if (!status.isHost && status.feedbackDone) done += 1;
  return done;
}

// Checklist + step mutations for one event's wrap.
export function useWrap(eventId: string | undefined) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const statusQuery = useQuery({
    queryKey: queryKeys.wrap.of(eventId, user?.id),
    queryFn: () => getWrapStatus(eventId!, user!.id),
    enabled: !!eventId && !!user,
    staleTime: 30_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.wrap.of(eventId, user?.id) });
    qc.invalidateQueries({ queryKey: ['wrapEntry', user?.id] });
  };

  const vote = useMutation({
    mutationFn: (args: { category: SuperlativeCategory; voteeId: string }) =>
      voteSuperlative({
        eventId: eventId!,
        category: args.category,
        voterId: user!.id,
        voteeId: args.voteeId,
      }),
    onSuccess: invalidate,
  });

  const feedback = useMutation({
    mutationFn: (args: { rating: 'up' | 'down'; note?: string }) =>
      submitEventFeedback({
        eventId: eventId!,
        userId: user!.id,
        rating: args.rating,
        note: args.note,
      }),
    onSuccess: invalidate,
  });

  const encore = useMutation({
    mutationFn: (want: boolean) =>
      want
        ? requestEncore(eventId!, user!.id)
        : withdrawEncore(eventId!, user!.id),
    // Optimistic toggle: the button flips immediately.
    onMutate: async (want) => {
      await qc.cancelQueries({ queryKey: queryKeys.wrap.of(eventId, user?.id) });
      const prev = qc.getQueryData<WrapStatus>(queryKeys.wrap.of(eventId, user?.id));
      if (prev) {
        qc.setQueryData<WrapStatus>(queryKeys.wrap.of(eventId, user?.id), {
          ...prev,
          encoreRequested: want,
          encoreCount: Math.max(0, prev.encoreCount + (want ? 1 : -1)),
        });
      }
      return { prev };
    },
    onError: (_e, _want, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.wrap.of(eventId, user?.id), ctx.prev);
    },
    onSettled: invalidate,
  });

  return { status: statusQuery.data, statusQuery, vote, feedback, encore, invalidate };
}

// Bumps the server-side view counter once per mount of the hub screen.
export function useWrapViewBump(eventId: string | undefined) {
  const bumped = useRef(false);
  useEffect(() => {
    if (!eventId || bumped.current) return;
    bumped.current = true;
    bumpWrapView(eventId).catch(() => {
      // Non-fatal: the checklist just stays emphasized one visit longer.
    });
  }, [eventId]);
}

// The recap ("your night in numbers"), attendee-guarded server-side.
export function useWrapSummary(eventId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['wrapSummary', eventId],
    queryFn: () => getWrapSummary(eventId!),
    enabled: !!eventId && enabled,
    staleTime: 60_000,
  });
}

// Most recently ended attended event still inside its 7-day wrap window.
// Powers the "Wrap up last night" entry cards on Home and Explore.
export function useWrapEntry() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['wrapEntry', user?.id],
    queryFn: () => getLatestWrappableEvent(user!.id),
    enabled: !!user,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
