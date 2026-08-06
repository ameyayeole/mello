import { supabase } from './supabase';
import type { MessagePoll, MessagePollOption } from '@/types/models';

// Polls in an event chat (migration 073).
//
// Its own service rather than a branch inside `community/polls.service`, for the
// same reason the tables are separate: the two answer to different owners. What
// they share — the shape of a poll, and the rule that a cast is final — is
// shared in the schema and in the component that draws one.

/**
 * Create the poll behind a message that has already been sent.
 *
 * Two inserts, in this order, and the order is the security model: the poll's
 * RLS policy checks that the message is *yours*, so a poll cannot be attached to
 * anyone else's message. The client mints the message id itself (as every other
 * chat send does), which is what lets the second insert name it.
 *
 * Not a transaction, because PostgREST has no client-side ones. A failure
 * between the two leaves a `type='poll'` message with no options — the bubble
 * renders the question and an empty poll rather than crashing, which is the
 * failure mode chosen on purpose over a phantom retry.
 */
export async function createMessagePoll(
  messageId: string,
  options: string[]
): Promise<void> {
  const { error: pollError } = await supabase
    .from('message_polls')
    .insert({ message_id: messageId });
  if (pollError) throw pollError;

  const { error: optionsError } = await supabase
    .from('message_poll_options')
    .insert(
      options.map((label, idx) => ({ poll_id: messageId, idx, label: label.trim() }))
    );
  if (optionsError) throw optionsError;
}

/**
 * Every poll in a page of messages, in one round trip.
 *
 * Two queries rather than one join: `my_option_id` comes from `message_poll_votes`,
 * which RLS scopes to your own rows, so asking for "the votes" returns at most
 * one row per poll — yours. Embedding it would make the options query depend on
 * a table whose visibility rules are deliberately narrower.
 */
export async function getMessagePolls(
  messageIds: string[]
): Promise<Map<string, MessagePoll>> {
  const byMessage = new Map<string, MessagePoll>();
  if (messageIds.length === 0) return byMessage;

  const { data: options, error } = await supabase
    .from('message_poll_options')
    .select('id, poll_id, idx, label, vote_count')
    .in('poll_id', messageIds)
    .order('idx', { ascending: true });
  if (error) throw error;

  for (const row of (options ?? []) as (MessagePollOption & {
    poll_id: string;
  })[]) {
    const poll = byMessage.get(row.poll_id) ?? {
      message_id: row.poll_id,
      options: [],
      my_option_id: null,
    };
    poll.options.push({
      id: row.id,
      idx: row.idx,
      label: row.label,
      vote_count: row.vote_count,
    });
    byMessage.set(row.poll_id, poll);
  }

  if (byMessage.size === 0) return byMessage;

  const { data: votes } = await supabase
    .from('message_poll_votes')
    .select('poll_id, option_id')
    .in('poll_id', [...byMessage.keys()]);

  for (const vote of (votes ?? []) as { poll_id: string; option_id: string }[]) {
    const poll = byMessage.get(vote.poll_id);
    if (poll) poll.my_option_id = vote.option_id;
  }

  return byMessage;
}

/**
 * Cast a vote. Final — there is no update or delete policy on the table, so a
 * second attempt fails on the primary key rather than changing anything.
 */
export async function castMessagePollVote(
  pollId: string,
  optionId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('message_poll_votes')
    .insert({ poll_id: pollId, option_id: optionId, user_id: userId });
  if (error) throw error;
}
