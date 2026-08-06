import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import { freshChannel } from '@/services/realtime';
import { queryKeys } from '@/constants/queryKeys';
import {
  getDirectMessages,
  sendDirectMessage,
  deleteDirectMessage,
  markDmRead,
} from '@/services/dm.service';
import { uploadChatPhoto } from '@/services/storage.service';
import { DirectMessage, ReplyTarget } from '@/types/models';
import { useAuthStore } from '@/stores/authStore';
import { CONFIG } from '@/constants/config';
import { newId } from '@/utils/id';

// The optimistic row's id is minted here and sent with the insert, so the row
// React first paints and the row the server confirms are the *same* row.
//
// It used to be a `tmp-…` string swapped for the real id on success, which
// changed the FlatList's key mid-flight: React unmounted the bubble and mounted
// a new one, and the entering animation played a second time a few hundred
// milliseconds after the first. That is what read as the message jumping.
// useEventChat has always minted ids this way.

export function useDirectChat(friendId: string, clearedAt?: string | null) {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();

  const { data: initial, isPending } = useQuery({
    queryKey: ['dm', userId, friendId, clearedAt ?? null],
    queryFn: () =>
      getDirectMessages(userId!, friendId, CONFIG.messagesPageSize, clearedAt),
    enabled: !!userId && !!friendId,
  });

  const [messages, setMessages] = useState<DirectMessage[]>(initial ?? []);

  useEffect(() => {
    // Keep unconfirmed optimistic rows on top of the fetched history.
    if (!initial) return;
    setMessages((prev) => {
      const pendingLocal = prev.filter((m) => m._status);
      return [...initial, ...pendingLocal];
    });
  }, [initial]);

  // Incoming messages from this friend. Our own outgoing messages are appended
  // optimistically on send (they have recipient_id = friend, so they wouldn't
  // match this filter anyway), which avoids duplicates. Deletes from either
  // side land via the DELETE listener (REPLICA IDENTITY FULL since 030), and
  // read-receipt flips (031) via the UPDATE listener on our sent messages.
  useEffect(() => {
    if (!userId) return;
    // `freshChannel`, not `supabase.channel`: this thread can be on screen while
    // another mount of the same one is still alive — open a DM from the profile
    // sheet of the person whose DM you are already in, or reach the same thread
    // from the Inbox while it sits on the stack below. A shared topic hands the
    // second mount the first one's subscribed channel and `.on()` throws.
    const channel = freshChannel(`dm:${userId}:${friendId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const m = payload.new as DirectMessage;
          if (m.sender_id === friendId) setMessages((prev) => [...prev, m]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'direct_messages',
          filter: `sender_id=eq.${userId}`,
        },
        (payload) => {
          const m = payload.new as DirectMessage;
          if (m.recipient_id !== friendId) return;
          setMessages((prev) =>
            prev.map((old) => (old.id === m.id ? { ...old, ...m } : old))
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'direct_messages',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const removedId = (payload.old as { id?: string })?.id;
          if (removedId)
            setMessages((prev) => prev.filter((m) => m.id !== removedId));
        }
      )
      .subscribe();

    return () => {
      // removeChannel, not unsubscribe: unsubscribe leaves the channel in the
      // client's registry for the next mount to trip over.
      supabase.removeChannel(channel);
    };
  }, [userId, friendId]);

  // Read receipts: whenever unread messages from this friend are on screen,
  // mark them read so the sender's ticks flip. Best-effort pre-migration.
  useEffect(() => {
    if (!userId) return;
    const hasUnread = messages.some(
      (m) => m.sender_id === friendId && !m.read_at && !m._status
    );
    if (!hasUnread) return;
    // The tab badge and the Inbox row badges both count these rows. Nothing
    // else notices the flip — the badge's own channel only listens for
    // INSERTs — so tell both here. Missing the second one leaves a row
    // claiming unread messages you are looking at.
    markDmRead(userId, friendId)
      .then(() => {
        qc.invalidateQueries({ queryKey: queryKeys.unreadDms.of(userId) });
        qc.invalidateQueries({
          queryKey: queryKeys.unreadDmCounts.of(userId),
        });
      })
      .catch(() => {});
  }, [messages, userId, friendId, qc]);

  function makeOptimistic(
    id: string,
    content: string,
    type: DirectMessage['type'],
    // Carried on the optimistic row as well, so the quote is on screen with the
    // message rather than a beat later when the server row replaces it.
    reply?: ReplyTarget | null
  ) {
    return {
      id,
      sender_id: userId!,
      recipient_id: friendId,
      content,
      type,
      created_at: new Date().toISOString(),
      reply_to_id: reply?.id ?? null,
      reply_preview: reply?.preview ?? null,
      reply_sender_name: reply?.senderName ?? null,
      _status: 'sending',
    } as DirectMessage;
  }

  // The id travels with the send, so the confirmed row comes back carrying the
  // one the optimistic row already had. `onSuccess` still replaces the row —
  // to pick up the server's timestamp and joined sender — but it replaces it
  // *in place*, under the same key.
  const sendMutation = useMutation({
    mutationFn: ({
      content,
      type = 'text',
      id,
      reply,
    }: {
      content: string;
      type?: DirectMessage['type'];
      id?: string;
      reply?: ReplyTarget | null;
    }) => sendDirectMessage(userId!, friendId, content, type, id, reply),
    onMutate: ({ content, type = 'text', id, reply }) => {
      const optimistic = makeOptimistic(id ?? newId(), content, type, reply);
      setMessages((prev) => [...prev, optimistic]);
      return { id: optimistic.id };
    },
    onSuccess: (msg, _vars, ctx) =>
      setMessages((prev) => prev.map((m) => (m.id === ctx?.id ? msg : m))),
    onError: (_e, _vars, ctx) =>
      setMessages((prev) => prev.filter((m) => m.id !== ctx?.id)),
  });

  // Image send: the optimistic bubble shows the local file while the shared
  // encoder uploads; the public-URL row replaces it on success — same id, so
  // the bubble is updated rather than swapped.
  const sendImageMutation = useMutation({
    mutationFn: async ({ localUri, id }: { localUri: string; id?: string }) => {
      const url = await uploadChatPhoto(userId!, localUri);
      return sendDirectMessage(userId!, friendId, url, 'image', id);
    },
    onMutate: ({ localUri, id }) => {
      const optimistic = makeOptimistic(id ?? newId(), localUri, 'image');
      setMessages((prev) => [...prev, optimistic]);
      return { id: optimistic.id };
    },
    onSuccess: (msg, _vars, ctx) =>
      setMessages((prev) => prev.map((m) => (m.id === ctx?.id ? msg : m))),
    onError: (_e, _vars, ctx) =>
      setMessages((prev) => prev.filter((m) => m.id !== ctx?.id)),
  });

  // Optimistic delete of your own message.
  const remove = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    deleteDirectMessage(messageId).catch(() => {});
  }, []);

  // The id is minted here rather than at the call site: react-query hands the
  // same `variables` object to `onMutate` and to `mutationFn`, so this is the
  // only place both halves can agree on one without every screen having to
  // remember to pass it.
  //
  // Only `.mutate` is exposed because only `.mutate` is used — wrapping the
  // whole mutation object meant cloning its prototype, which is a lot of
  // machinery to keep two call sites working.
  const send = useCallback(
    (
      vars: {
        content: string;
        type?: DirectMessage['type'];
        reply?: ReplyTarget | null;
      },
      opts?: Parameters<typeof sendMutation.mutate>[1]
    ) => sendMutation.mutate({ ...vars, id: newId() }, opts),
    [sendMutation]
  );

  const sendImage = useCallback(
    (
      vars: { localUri: string },
      opts?: Parameters<typeof sendImageMutation.mutate>[1]
    ) => sendImageMutation.mutate({ ...vars, id: newId() }, opts),
    [sendImageMutation]
  );

  return {
    // The first fetch, for the thread's skeleton. `messages` starts as `[]`,
    // which a screen cannot tell apart from a conversation with nothing in it.
    loading: isPending,
    messages, send, sendImage, remove,
  };
}
