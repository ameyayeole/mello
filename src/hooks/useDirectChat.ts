import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import { queryKeys } from '@/constants/queryKeys';
import {
  getDirectMessages,
  sendDirectMessage,
  deleteDirectMessage,
  markDmRead,
} from '@/services/dm.service';
import { uploadChatPhoto } from '@/services/storage.service';
import { DirectMessage } from '@/types/models';
import { useAuthStore } from '@/stores/authStore';
import { CONFIG } from '@/constants/config';

function tempId() {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function useDirectChat(friendId: string, clearedAt?: string | null) {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();

  const { data: initial } = useQuery({
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
    const channel = supabase
      .channel(`dm:${userId}:${friendId}`)
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
      channel.unsubscribe();
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

  function makeOptimistic(content: string, type: DirectMessage['type']) {
    return {
      id: tempId(),
      sender_id: userId!,
      recipient_id: friendId,
      content,
      type,
      created_at: new Date().toISOString(),
      _status: 'sending',
    } as DirectMessage;
  }

  const send = useMutation({
    mutationFn: ({
      content,
      type = 'text',
    }: {
      content: string;
      type?: DirectMessage['type'];
    }) => sendDirectMessage(userId!, friendId, content, type),
    onMutate: ({ content, type = 'text' }) => {
      const optimistic = makeOptimistic(content, type);
      setMessages((prev) => [...prev, optimistic]);
      return { tempId: optimistic.id };
    },
    onSuccess: (msg, _vars, ctx) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === ctx?.tempId ? msg : m))
      ),
    onError: (_e, _vars, ctx) =>
      setMessages((prev) => prev.filter((m) => m.id !== ctx?.tempId)),
  });

  // Image send: the optimistic bubble shows the local file while the shared
  // encoder uploads; the public-URL row replaces it on success.
  const sendImage = useMutation({
    mutationFn: async ({ localUri }: { localUri: string }) => {
      const url = await uploadChatPhoto(userId!, localUri);
      return sendDirectMessage(userId!, friendId, url, 'image');
    },
    onMutate: ({ localUri }) => {
      const optimistic = makeOptimistic(localUri, 'image');
      setMessages((prev) => [...prev, optimistic]);
      return { tempId: optimistic.id };
    },
    onSuccess: (msg, _vars, ctx) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === ctx?.tempId ? msg : m))
      ),
    onError: (_e, _vars, ctx) =>
      setMessages((prev) => prev.filter((m) => m.id !== ctx?.tempId)),
  });

  // Optimistic delete of your own message.
  const remove = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    deleteDirectMessage(messageId).catch(() => {});
  }, []);

  return { messages, send, sendImage, remove };
}
