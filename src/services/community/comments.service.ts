import { supabase } from '@/services/supabase';
import { PostComment } from '@/types/models';

// Top-level comments, relevancy-ranked (post_comments_ranked). Tombstoned rows
// come back with body=null + deleted=true so the client renders "comment removed".
export async function getComments(params: {
  postId: string;
  viewerId: string;
}): Promise<PostComment[]> {
  const { data, error } = await supabase.rpc('post_comments_ranked', {
    p_post_id: params.postId,
    p_viewer_id: params.viewerId,
    p_limit: 100,
  });
  if (error) throw error;
  return (data ?? []) as PostComment[];
}

// Replies for one parent, chronological (oldest-first).
export async function getReplies(params: {
  parentId: string;
  viewerId: string;
}): Promise<PostComment[]> {
  const { data, error } = await supabase.rpc('post_comment_replies', {
    p_parent_id: params.parentId,
    p_viewer_id: params.viewerId,
  });
  if (error) throw error;
  return (data ?? []) as PostComment[];
}

export async function addComment(params: {
  postId: string;
  authorId: string;
  body: string;
  parentId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('post_comments')
    .insert({
      post_id: params.postId,
      author_id: params.authorId,
      body: params.body.trim(),
      parent_id: params.parentId ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

// Tombstone a parent that still has replies (UPDATE — the row stays, rendered as
// "comment removed", replies readable); hard-delete a leaf (DELETE). The count
// trigger (migration 048) decrements on either path.
export async function deleteComment(params: {
  commentId: string;
  hasReplies: boolean;
}): Promise<void> {
  if (params.hasReplies) {
    const { error } = await supabase
      .from('post_comments')
      .update({ deleted_at: new Date().toISOString(), body: '', mentions: [] })
      .eq('id', params.commentId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('post_comments')
      .delete()
      .eq('id', params.commentId);
    if (error) throw error;
  }
}

export async function setCommentsEnabled(params: {
  postId: string;
  enabled: boolean;
}): Promise<void> {
  const { error } = await supabase
    .from('posts')
    .update({ comments_enabled: params.enabled })
    .eq('id', params.postId);
  if (error) throw error;
}
