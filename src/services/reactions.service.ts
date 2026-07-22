import { supabase } from './supabase';
import { MessageReaction, ReactionTarget } from '@/types/models';

// Tapback reactions (migration 041). One table serves both chats; which column
// carries the id is the only difference, so it is resolved once here.
export function reactionColumn(target: ReactionTarget): 'message_id' | 'dm_id' {
  return target === 'event' ? 'message_id' : 'dm_id';
}

/**
 * Every reaction on a page of messages, grouped by the message it belongs to.
 *
 * Best-effort: before migration 041 is run the table doesn't exist and this
 * returns an empty map rather than throwing, matching how the app treats every
 * other not-yet-migrated feature (see getChatReads).
 */
export async function getReactions(
  target: ReactionTarget,
  messageIds: string[]
): Promise<Map<string, MessageReaction[]>> {
  const byMessage = new Map<string, MessageReaction[]>();
  if (messageIds.length === 0) return byMessage;

  const column = reactionColumn(target);
  const { data, error } = await supabase
    .from('message_reactions')
    .select('*')
    .in(column, messageIds);
  if (error) return byMessage;

  for (const row of (data ?? []) as MessageReaction[]) {
    const key = row[column];
    if (!key) continue;
    const list = byMessage.get(key);
    if (list) list.push(row);
    else byMessage.set(key, [row]);
  }
  return byMessage;
}

/**
 * Add, swap or remove your reaction on one message.
 *
 * One row per person per message (the partial unique indexes in 041), so
 * picking a second emoji replaces the first and picking the same one again
 * clears it. The delete runs unconditionally: it is the "remove" case and the
 * "swap" case's first half, and doing it in one statement avoids a read that
 * the caller's optimistic state has already made a guess at.
 *
 * Returns what the reaction ended up as — the emoji, or null if it was cleared
 * — so a caller that guessed wrong can settle on the truth.
 */
export async function toggleReaction(
  target: ReactionTarget,
  messageId: string,
  userId: string,
  emoji: string
): Promise<string | null> {
  const column = reactionColumn(target);

  const { data: existing } = await supabase
    .from('message_reactions')
    .select('id, emoji')
    .eq(column, messageId)
    .eq('user_id', userId)
    .maybeSingle();

  const { error: delError } = await supabase
    .from('message_reactions')
    .delete()
    .eq(column, messageId)
    .eq('user_id', userId);
  if (delError) throw delError;

  // Same emoji again = take it back.
  if (existing?.emoji === emoji) return null;

  const { error } = await supabase
    .from('message_reactions')
    .insert({ [column]: messageId, user_id: userId, emoji });
  if (error) throw error;
  return emoji;
}
