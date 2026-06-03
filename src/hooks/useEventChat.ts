import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import { getMessages, sendMessage } from '@/services/chat.service';
import { Message } from '@/types/models';
import { CONFIG } from '@/constants/config';

export function useEventChat(eventId: string) {
  const qc = useQueryClient();

  const { data: initial } = useQuery({
    queryKey: ['messages', eventId],
    queryFn: () => getMessages(eventId, CONFIG.messagesPageSize),
  });

  const [messages, setMessages] = useState<Message[]>(initial ?? []);

  useEffect(() => {
    if (initial) setMessages(initial);
  }, [initial]);

  useEffect(() => {
    const channel = supabase
      .channel(`event:${eventId}:messages`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [eventId]);

  const send = useMutation({
    mutationFn: ({ senderId, content }: { senderId: string; content: string }) =>
      sendMessage(eventId, senderId, content),
  });

  return { messages, send };
}
