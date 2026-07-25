import { supabase } from '@/services/supabase';
import { CommunityPost, PostVisibility } from '@/types/models';

// The keyset cursor: the last row of the page you just read. Passing it back
// asks community_feed() for rows ranked strictly after this (score, created_at,
// id) — the ranked-feed keyset (migration 062). Never an offset.
export type FeedCursor = { score: number; createdAt: string; id: string };

export async function getCommunityFeed(params: {
  userId: string;
  cursor?: FeedCursor | null;
  limit?: number;
}): Promise<CommunityPost[]> {
  const { data, error } = await supabase.rpc('community_feed', {
    p_user_id: params.userId,
    p_cursor_score: params.cursor?.score ?? null,
    p_cursor_created_at: params.cursor?.createdAt ?? null,
    p_cursor_id: params.cursor?.id ?? null,
    p_limit: params.limit ?? 10,
  });
  if (error) throw error;
  return (data ?? []) as CommunityPost[];
}

// One author's posts for the Profile "Posts" tab. Viewer-scoped by the
// user_posts RPC (SECURITY INVOKER → posts RLS); same keyset shape as the feed.
export async function getUserPosts(params: {
  targetId: string;
  viewerId: string;
  cursor?: FeedCursor | null;
  limit?: number;
}): Promise<CommunityPost[]> {
  const { data, error } = await supabase.rpc('user_posts', {
    p_target_id: params.targetId,
    p_viewer_id: params.viewerId,
    p_cursor_created_at: params.cursor?.createdAt ?? null,
    p_cursor_id: params.cursor?.id ?? null,
    p_limit: params.limit ?? 12,
  });
  if (error) throw error;
  return (data ?? []) as CommunityPost[];
}

export async function createTextPost(params: {
  authorId: string;
  body: string;
  visibility: PostVisibility;
  city: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: params.authorId,
      type: 'text',
      body: params.body.trim(),
      visibility: params.visibility,
      city: params.city,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function createPhotoPost(params: {
  authorId: string;
  body: string; // caption; may be empty for a pure-photo post
  media: string[]; // public URLs, ordered (carousel order)
  visibility: PostVisibility;
  city: string | null;
}): Promise<string> {
  const caption = params.body.trim();
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: params.authorId,
      type: 'photo',
      body: caption.length > 0 ? caption : null,
      media: params.media,
      visibility: params.visibility,
      city: params.city,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

// Reshare an event's wrap as a post. No media is copied — the card resolves the
// preview from ref_wrap_event_id at render. The shared_wrap insert RLS (059)
// enforces that the author attended the event; a null caption is stored as null.
export async function createSharedWrap(params: {
  authorId: string;
  eventId: string;
  body: string; // optional caption; '' ⇒ null
  visibility: PostVisibility;
  city: string | null;
}): Promise<string> {
  const caption = params.body.trim();
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: params.authorId,
      type: 'shared_wrap',
      body: caption.length > 0 ? caption : null,
      ref_wrap_event_id: params.eventId,
      visibility: params.visibility,
      city: params.city,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}
