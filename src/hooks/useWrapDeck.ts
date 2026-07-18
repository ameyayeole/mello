import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCoAttendees,
  getMyRatings,
  rateAttendee,
  unrateAttendee,
} from '@/services/wrap.service';
import { useAuthStore } from '@/stores/authStore';
import { CoAttendee } from '@/types/models';

// Deck state for the "rate the people" screen: co-attendees you haven't
// rated yet, plus rate/undo with a session history stack (useSwipeDeck's
// shape, minus the geo paging it doesn't need).
export function useWrapDeck(eventId: string | undefined) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  // Ids rated during this session, newest last (undo pops from here).
  const [history, setHistory] = useState<
    { attendee: CoAttendee; rating: 'up' | 'down' }[]
  >([]);

  const attendeesQuery = useQuery({
    queryKey: ['wrapAttendees', eventId, user?.id],
    queryFn: () => getCoAttendees(eventId!, user!.id),
    enabled: !!eventId && !!user,
    staleTime: 60_000,
  });

  const ratingsQuery = useQuery({
    queryKey: ['wrapRatings', eventId, user?.id],
    queryFn: () => getMyRatings(eventId!, user!.id),
    enabled: !!eventId && !!user,
    staleTime: 30_000,
  });

  const deck = useMemo(() => {
    const rated = new Set((ratingsQuery.data ?? []).map((r) => r.ratee_id));
    return (attendeesQuery.data ?? []).filter((a) => !rated.has(a.id));
  }, [attendeesQuery.data, ratingsQuery.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['wrapRatings', eventId, user?.id] });
    qc.invalidateQueries({ queryKey: ['wrap', eventId, user?.id] });
  };

  const rate = useMutation({
    mutationFn: (args: { attendee: CoAttendee; rating: 'up' | 'down' }) =>
      rateAttendee(eventId!, user!.id, args.attendee.id, args.rating),
    onMutate: async (args) => {
      setHistory((h) => [...h, args]);
      // Optimistically mark rated so the deck advances instantly.
      await qc.cancelQueries({ queryKey: ['wrapRatings', eventId, user?.id] });
      const prev = qc.getQueryData<{ ratee_id: string; rating: 'up' | 'down' }[]>(
        ['wrapRatings', eventId, user?.id]
      );
      qc.setQueryData(
        ['wrapRatings', eventId, user?.id],
        [...(prev ?? []), { ratee_id: args.attendee.id, rating: args.rating }]
      );
      return { prev };
    },
    onError: (_e, args, ctx) => {
      setHistory((h) => h.filter((x) => x.attendee.id !== args.attendee.id));
      if (ctx?.prev)
        qc.setQueryData(['wrapRatings', eventId, user?.id], ctx.prev);
    },
    onSettled: invalidate,
  });

  const undo = useMutation({
    mutationFn: (rateeId: string) => unrateAttendee(eventId!, user!.id, rateeId),
    onMutate: async (rateeId) => {
      setHistory((h) => h.filter((x) => x.attendee.id !== rateeId));
      await qc.cancelQueries({ queryKey: ['wrapRatings', eventId, user?.id] });
      const prev = qc.getQueryData<{ ratee_id: string; rating: 'up' | 'down' }[]>(
        ['wrapRatings', eventId, user?.id]
      );
      qc.setQueryData(
        ['wrapRatings', eventId, user?.id],
        (prev ?? []).filter((r) => r.ratee_id !== rateeId)
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev)
        qc.setQueryData(['wrapRatings', eventId, user?.id], ctx.prev);
    },
    onSettled: invalidate,
  });

  const lastRated = history[history.length - 1];

  return {
    deck,
    total: attendeesQuery.data?.length ?? 0,
    isLoading: attendeesQuery.isLoading || ratingsQuery.isLoading,
    rate,
    undo,
    lastRated,
  };
}
