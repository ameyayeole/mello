import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import { freshChannel } from '@/services/realtime';
import {
  castMessagePollVote,
  getMessagePolls,
} from '@/services/chatPolls.service';
import { useAuthStore } from '@/stores/authStore';
import type { Message, MessagePoll } from '@/types/models';

/**
 * Every poll in the thread that is currently loaded, kept live.
 *
 * Keyed on the ids of the `type='poll'` messages rather than on the event, so it
 * refetches when a new poll arrives and does nothing at all in a thread that has
 * none — which is most of them.
 *
 * Results update for everyone, not just the voter. `message_poll_options` is on
 * the realtime publication and carries the counts, so a vote anywhere in the
 * event arrives here as an UPDATE and invalidates the query. There is no filter
 * on the subscription because a poll's options carry no event id — RLS is what
 * scopes it: `can_see_message` means the only option rows this client can ever
 * receive belong to events it is in.
 */
export function useMessagePolls(eventId: string, messages: Message[]) {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();

  // Confirmed polls only. An optimistic row has a client-minted id the server
  // has never seen, so asking for its options returns nothing and would just
  // churn the query on every send.
  const pollIds = useMemo(
    () =>
      messages
        .filter((m) => m.type === 'poll' && !m._status)
        .map((m) => m.id)
        .sort(),
    [messages]
  );
  const idKey = pollIds.join(',');

  const key = ['messagePolls', eventId, idKey, userId] as const;

  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getMessagePolls(pollIds),
    enabled: !!userId && pollIds.length > 0,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (pollIds.length === 0) return;
    const channel = freshChannel(`event:${eventId}:pollvotes`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'message_poll_options' },
        (payload) => {
          const row = payload.new as { poll_id?: string };
          if (row?.poll_id && pollIds.includes(row.poll_id)) {
            qc.invalidateQueries({ queryKey: ['messagePolls', eventId] });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // `pollIds` is rebuilt per render; `idKey` is the stable view of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, idKey, qc]);

  const voteMutation = useMutation({
    mutationFn: ({ pollId, optionId }: { pollId: string; optionId: string }) =>
      castMessagePollVote(pollId, optionId, userId!),
    // Optimistic, because a vote you can see land is the whole point of tapping
    // it, and the round trip on a bad connection is long enough to feel broken.
    // A cast is final either way, so there is no "undo" state to get wrong.
    onMutate: async ({ pollId, optionId }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Map<string, MessagePoll>>(key);
      qc.setQueryData<Map<string, MessagePoll>>(key, (polls) => {
        if (!polls) return polls;
        const poll = polls.get(pollId);
        if (!poll || poll.my_option_id) return polls;
        const next = new Map(polls);
        next.set(pollId, {
          ...poll,
          my_option_id: optionId,
          options: poll.options.map((o) =>
            o.id === optionId ? { ...o, vote_count: o.vote_count + 1 } : o
          ),
        });
        return next;
      });
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['messagePolls', eventId] }),
  });

  const vote = useCallback(
    (pollId: string, optionId: string) => {
      if (!userId) return;
      voteMutation.mutate({ pollId, optionId });
    },
    [userId, voteMutation]
  );

  return { polls: data, vote };
}
