import { supabase } from '@/services/supabase';

// Like/unlike a comment. (comment_id, user_id) PK guards duplicates; count +
// author notification are trigger-driven (migration 052). Mirrors postLikes.

export async function likeComment(params: {
  commentId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('comment_likes')
    .insert({ comment_id: params.commentId, user_id: params.userId });
  if (error) throw error;
}

export async function unlikeComment(params: {
  commentId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('comment_likes')
    .delete()
    .eq('comment_id', params.commentId)
    .eq('user_id', params.userId);
  if (error) throw error;
}
