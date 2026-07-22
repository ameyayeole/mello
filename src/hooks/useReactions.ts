import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/services/supabase';
import {
  getReactions,
  reactionColumn,
  toggleReaction,
} from '@/services/reactions.service';
import { useAuthStore } from '@/stores/authStore';
import { MessageReaction, ReactionTarget } from '@/types/models';
import { showError } from '@/utils/errors';

/**
 * Tapbacks for one conversation: the reactions on the messages currently
 * loaded, kept live, plus the toggle.
 *
 * Shared by both threads. It deliberately does *not* live inside useEventChat /
 * useDirectChat: those two own the message list and its optimistic state, and
 * folding a second table's realtime feed into either of them would put two
 * unrelated failure modes on one channel.
 *
 * The realtime subscription is unfiltered — Postgres changes can't be filtered
 * on "id in this page of messages" — so it leans on RLS (migration 041) to
 * deliver only reactions in conversations the viewer is part of, then drops
 * anything about a message that isn't on screen.
 */
export function useReactions(
  target: ReactionTarget,
  chatId: string | undefined,
  messageIds: string[]
) {
  const userId = useAuthStore((s) => s.user?.id);
  const [byMessage, setByMessage] = useState<Map<string, MessageReaction[]>>(
    new Map()
  );

  // The message ids as a stable value, so the fetch runs when the page of
  // messages actually changes rather than on every render's new array.
  const idKey = messageIds.join(',');

  // Realtime rows arrive for the whole conversation, including messages that
  // have scrolled out of the fetched page; a ref keeps the filter current
  // without tearing down the subscription every time a message lands.
  const visibleIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    visibleIds.current = new Set(idKey ? idKey.split(',') : []);
  }, [idKey]);

  useEffect(() => {
    let cancelled = false;
    // An empty page resolves to an empty map rather than clearing state here —
    // a synchronous setState in an effect body is a cascading render.
    getReactions(target, idKey ? idKey.split(',') : []).then((map) => {
      if (!cancelled) setByMessage(map);
    });
    return () => {
      cancelled = true;
    };
  }, [target, idKey]);

  useEffect(() => {
    if (!chatId) return;
    const column = reactionColumn(target);

    const channel = supabase
      .channel(`reactions:${target}:${chatId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const row = (payload.new ?? payload.old) as MessageReaction;
          const key = row?.[column];
          if (!key || !visibleIds.current.has(key)) return;

          setByMessage((prev) => {
            const next = new Map(prev);
            const list = (next.get(key) ?? []).filter(
              // A person has at most one reaction per message, so a change of
              // any kind means dropping whatever they had first.
              (r) => r.user_id !== row.user_id
            );
            if (payload.eventType !== 'DELETE') list.push(row);
            if (list.length > 0) next.set(key, list);
            else next.delete(key);
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [target, chatId]);

  /**
   * Apply a tapback, showing it before the server has agreed.
   *
   * The optimistic row carries a temporary id; the realtime echo replaces it,
   * matched on user rather than on id, which is why the reducer above keys on
   * user_id.
   */
  const toggle = useCallback(
    (messageId: string, emoji: string) => {
      if (!userId) return;
      const column = reactionColumn(target);
      const before = byMessage.get(messageId) ?? [];
      const mine = before.find((r) => r.user_id === userId);
      const clearing = mine?.emoji === emoji;

      setByMessage((prev) => {
        const next = new Map(prev);
        const list = (next.get(messageId) ?? []).filter(
          (r) => r.user_id !== userId
        );
        if (!clearing) {
          list.push({
            id: `tmp-${messageId}-${userId}`,
            message_id: column === 'message_id' ? messageId : null,
            dm_id: column === 'dm_id' ? messageId : null,
            user_id: userId,
            emoji,
            created_at: new Date().toISOString(),
          });
        }
        if (list.length > 0) next.set(messageId, list);
        else next.delete(messageId);
        return next;
      });

      toggleReaction(target, messageId, userId, emoji).catch((e) => {
        // Put back exactly what was there. The realtime echo never comes for a
        // write the server rejected, so nothing else would correct this.
        setByMessage((prev) => {
          const next = new Map(prev);
          if (before.length > 0) next.set(messageId, before);
          else next.delete(messageId);
          return next;
        });
        showError(e, 'Reaction not saved');
      });
    },
    [byMessage, target, userId]
  );

  return { byMessage, toggle };
}
