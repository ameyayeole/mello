import { supabase } from './supabase';
import { Profile } from '@/types/models';

// ─── BLOCKS ────────────────────────────────────────────────────────────────

// Whether the current user has blocked `blockedId`.
export async function isBlocked(
  blockerId: string,
  blockedId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocker_id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

export async function blockUser(
  blockerId: string,
  blockedId: string
): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .insert({ blocker_id: blockerId, blocked_id: blockedId });

  if (error) throw error;
}

export async function unblockUser(
  blockerId: string,
  blockedId: string
): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);

  if (error) throw error;
}

// The list of profiles the current user has blocked (most recent first).
export async function getBlockedUsers(blockerId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('created_at, blocked:profiles!blocked_id(*)')
    .eq('blocker_id', blockerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => r.blocked).filter(Boolean) as Profile[];
}

// ─── REPORTS ───────────────────────────────────────────────────────────────

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'inappropriate'
  | 'fake_profile'
  | 'other';

// Report a specific post. reported_id carries the author; post_id points at the
// offending row (migration 054). >=3 distinct reporters auto-hides it (061).
export async function reportPost(params: {
  reporterId: string;
  reportedId: string;
  postId: string;
  reason: ReportReason;
  details?: string;
}): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: params.reporterId,
    reported_id: params.reportedId,
    post_id: params.postId,
    reason: params.reason,
    details: params.details ?? null,
  });
  if (error) throw error;
}

export async function reportUser(
  reporterId: string,
  reportedId: string,
  reason: ReportReason,
  details?: string
): Promise<void> {
  const { error } = await supabase
    .from('reports')
    .insert({
      reporter_id: reporterId,
      reported_id: reportedId,
      reason,
      details: details ?? null,
    });

  if (error) throw error;
}

// Report a specific comment. reported_id still carries the content's author;
// comment_id points at the offending row (migration 054).
export async function reportComment(params: {
  reporterId: string;
  reportedId: string;
  commentId: string;
  reason: ReportReason;
  details?: string;
}): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: params.reporterId,
    reported_id: params.reportedId,
    comment_id: params.commentId,
    reason: params.reason,
    details: params.details ?? null,
  });

  if (error) throw error;
}
