import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import { freshChannel } from '@/services/realtime';
import {
  getMessages,
  sendMessage,
  deleteMessage,
  getChatReads,
  upsertChatRead,
} from '@/services/chat.service';
import { uploadChatPhoto } from '@/services/storage.service';
import { useAuthStore } from '@/stores/authStore';
import { Message, ReplyTarget } from '@/types/models';
import { CONFIG } from '@/constants/config';
import { newId } from '@/utils/id';
import { replyOf } from '@/utils/chatActions';

export function useEventChat(eventId: string, clearedAt?: string | null) {
  const userId = useAuthStore((s) => s.user?.id);
  const { data: initial } = useQuery({
    queryKey: ['messages', eventId, clearedAt ?? null],
    queryFn: () => getMessages(eventId, CONFIG.messagesPageSize, clearedAt),
  });

  const [messages, setMessages] = useState<Message[]>(initial ?? []);

  // Read watermarks (user_id → last_read_at) for WhatsApp-style ✓✓.
  const [reads, setReads] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    getChatReads(eventId).then((map) => {
      if (!cancelled) setReads(map);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Bump our own watermark whenever we're looking at new messages, so other
  // people's ticks flip to read. Best-effort before migration 031.
  useEffect(() => {
    if (!userId || messages.length === 0) return;
    upsertChatRead(eventId, userId).catch(() => {});
  }, [messages.length, userId, eventId]);

  useEffect(() => {
    // Merge fetched history without clobbering optimistic messages that haven't
    // been confirmed yet (dedupe by id, keep any local _status rows on top).
    if (!initial) return;
    setMessages((prev) => {
      const pendingLocal = prev.filter(
        (m) => m._status && !initial.some((i) => i.id === m.id)
      );
      return [...initial, ...pendingLocal];
    });
  }, [initial]);

  useEffect(() => {
    // `freshChannel` rather than clearing the registry first, which is what this
    // used to do. Sweeping channels by name assumed only one mount of a given
    // event chat could exist — but a chat reached while the same one is still on
    // the stack below had the older mount's *live* channel torn out from under
    // it, and the sweep is async, so the replacement could still be handed a
    // subscribed channel and throw. A topic nobody else can be holding has
    // neither problem. See services/realtime.
    const channel = freshChannel(`event:${eventId}:messages`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((prev) => {
            // If this row is already present (our own optimistic message, now
            // confirmed by the server), replace it in place and drop _status.
            if (prev.some((m) => m.id === incoming.id)) {
              return prev.map((m) =>
                m.id === incoming.id
                  ? { ...incoming, sender: incoming.sender ?? m.sender }
                  : m
              );
            }
            return [...prev, incoming];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const removedId = (payload.old as { id?: string })?.id;
          if (removedId)
            setMessages((prev) => prev.filter((m) => m.id !== removedId));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_reads',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const row = payload.new as {
            user_id?: string;
            last_read_at?: string;
          };
          if (row?.user_id && row.last_read_at) {
            setReads((prev) => new Map(prev).set(row.user_id!, row.last_read_at!));
          }
        }
      )
      .subscribe();

    return () => {
      // removeChannel, not unsubscribe: only the former drops it from the
      // client's registry, which is what keeps that registry from growing a
      // dead channel per thread you have opened.
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  // Fire-and-forget send: the bubble shows instantly as 'sending', flips to
  // confirmed when the realtime echo lands, or to 'failed' if the insert errors.
  const send = useCallback(
    (
      senderId: string,
      content: string,
      type: Message['type'] = 'text',
      // What this replies to, if anything. Carried on the optimistic row too,
      // so the quote is on screen with the message rather than a beat later
      // when the echo lands.
      reply?: ReplyTarget | null
    ) => {
      const id = newId();
      const optimistic: Message = {
        id,
        event_id: eventId,
        sender_id: senderId,
        content,
        type,
        created_at: new Date().toISOString(),
        reply_to_id: reply?.id ?? null,
        reply_preview: reply?.preview ?? null,
        reply_sender_name: reply?.senderName ?? null,
        _status: 'sending',
      };
      setMessages((prev) => [...prev, optimistic]);

      sendMessage(eventId, senderId, content, id, type, reply)
        .then(() => {
          // Clear the spinner even if the realtime echo is slow to arrive.
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, _status: undefined } : m))
          );
        })
        .catch(() => {
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, _status: 'failed' } : m))
          );
        });
    },
    [eventId]
  );

  // Image send: optimistic bubble shows the local file immediately; the public
  // URL from the upload replaces it via the realtime echo.
  const sendImage = useCallback(
    (senderId: string, localUri: string) => {
      const id = newId();
      const optimistic: Message = {
        id,
        event_id: eventId,
        sender_id: senderId,
        content: localUri,
        type: 'image',
        created_at: new Date().toISOString(),
        _status: 'sending',
      };
      setMessages((prev) => [...prev, optimistic]);

      uploadChatPhoto(senderId, localUri)
        .then((url) => sendMessage(eventId, senderId, url, id, 'image'))
        .then(() => {
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, _status: undefined } : m))
          );
        })
        .catch(() => {
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, _status: 'failed' } : m))
          );
        });
    },
    [eventId]
  );

  // Retry a message that previously failed: drop the failed row and re-send.
  const retry = useCallback(
    (message: Message) => {
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      if (message.type === 'image') sendImage(message.sender_id, message.content);
      // The failed row still carries its reply snapshot, so a retry keeps the
      // quote rather than sending the text on its own.
      else
        send(message.sender_id, message.content, message.type, replyOf(message));
    },
    [send, sendImage]
  );

  // Optimistic delete (own message, or host deleting any message).
  const remove = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    deleteMessage(messageId).catch(() => {
      // The realtime DELETE echo never comes if the server rejected it; a
      // refetch on next open restores the row. Nothing else to do here.
    });
  }, []);

  return { messages, reads, send, sendImage, retry, remove };
}
