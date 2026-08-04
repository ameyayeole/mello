import { supabase } from '@/services/supabase';
import { Poll, PollOption, PostVisibility } from '@/types/models';

const DAY_MS = 24 * 60 * 60 * 1000;

// A poll is authored in three writes (no RPC): the post (type='poll', body =
// question), the polls row (closes_at), then the options. The post's RLS +
// polls_insert/poll_options_insert policies gate each. Returns the post id.
export async function createPoll(params: {
  authorId: string;
  question: string;
  options: string[]; // 2–4 non-empty, ordered
  durationDays: 1 | 3 | 7;
  visibility: PostVisibility;
  city: string | null;
  // An event of the author's to link (migration 070) — a poll about an event
  // is still a poll, so this rides on the post row like any other type.
  refEventId?: string | null;
}): Promise<string> {
  const question = params.question.trim();
  const { data: post, error: postErr } = await supabase
    .from('posts')
    .insert({
      author_id: params.authorId,
      type: 'poll',
      body: question,
      visibility: params.visibility,
      city: params.city,
      ref_event_id: params.refEventId ?? null,
    })
    .select('id')
    .single();
  if (postErr) throw postErr;
  const postId = (post as { id: string }).id;

  const closesAt = new Date(
    Date.now() + params.durationDays * DAY_MS
  ).toISOString();
  const { error: pollErr } = await supabase
    .from('polls')
    .insert({ post_id: postId, closes_at: closesAt });
  if (pollErr) throw pollErr;

  const rows = params.options
    .map((label) => label.trim())
    .filter((label) => label.length > 0)
    .map((label, idx) => ({ poll_id: postId, idx, label }));
  const { error: optErr } = await supabase.from('poll_options').insert(rows);
  if (optErr) throw optErr;

  return postId;
}

// One poll's render data: options + counts, closes_at, and (from the viewer's
// own vote row — the only one RLS lets them read) which option they picked.
export async function getPoll(postId: string, viewerId: string): Promise<Poll> {
  const [{ data: poll, error: pErr }, { data: options, error: oErr }, { data: myVote }] =
    await Promise.all([
      supabase.from('polls').select('post_id, closes_at').eq('post_id', postId).single(),
      supabase
        .from('poll_options')
        .select('id, idx, label, vote_count')
        .eq('poll_id', postId)
        .order('idx', { ascending: true }),
      supabase
        .from('poll_votes')
        .select('option_id')
        .eq('poll_id', postId)
        .eq('user_id', viewerId)
        .maybeSingle(),
    ]);
  if (pErr) throw pErr;
  if (oErr) throw oErr;
  return {
    post_id: postId,
    closes_at: (poll as { closes_at: string }).closes_at,
    options: (options ?? []) as PollOption[],
    my_option_id: (myVote as { option_id: string } | null)?.option_id ?? null,
  };
}

// Cast a locked vote. The UNIQUE(poll_id,user_id) constraint + insert-only RLS
// are the real guard; a duplicate throws (surfaced as an already-voted error).
export async function castVote(params: {
  pollId: string;
  optionId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase.from('poll_votes').insert({
    poll_id: params.pollId,
    option_id: params.optionId,
    user_id: params.userId,
  });
  if (error) throw error;
}
