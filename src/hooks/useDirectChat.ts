import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import { getDirectMessages, sendDirectMessage } from '@/services/dm.service';
import { DirectMessage } from '@/types/models';
import { useAuthStore } from '@/stores/authStore';
import { CONFIG } from '@/constants/config';

export function useDirectChat(friendId: string) {
  const userId = useAuthStore((s) => s.user?.id);

  const { data: initial } = useQuery({
    queryKey: ['dm', userId, friendId],
    queryFn: () => getDirectMessages(userId!, friendId, CONFIG.messagesPageSize),
    enabled: !!userId && !!friendId,
  });

  const [messages, setMessages] = useState<DirectMessage[]>(initial ?? []);

  useEffect(() => {
    if (initial) setMessages(initial);
  }, [initial]);

  // Incoming messages from this friend. Our own outgoing messages are appended
  // optimistically on send (they have recipient_id = friend, so they wouldn't
  // match this filter anyway), which avoids duplicates.
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
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId, friendId]);

  const send = useMutation({
    mutationFn: ({ content }: { content: string }) =>
      sendDirectMessage(userId!, friendId, content),
    onSuccess: (msg) => setMessages((prev) => [...prev, msg]),
  });

  return { messages, send };
}
