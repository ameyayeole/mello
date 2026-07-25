import { supabase } from '@/services/supabase';

// Like/unlike a post. The (post_id, user_id) PK on post_likes means a duplicate
// like is a no-op conflict at the DB — the optimistic UI never sends one, but the
// constraint is the real guard. Count + author notification are trigger-driven
// (migration 046), so these just write the membership row.

export async function likePost(params: {
  postId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('post_likes')
    .insert({ post_id: params.postId, user_id: params.userId });
  if (error) throw error;
}

export async function unlikePost(params: {
  postId: string;
  userId: string;
}): Promise<void> {
  const { error } = await supabase
    .from('post_likes')
    .delete()
    .eq('post_id', params.postId)
    .eq('user_id', params.userId);
  if (error) throw error;
}
