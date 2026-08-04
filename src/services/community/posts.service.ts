import { supabase } from '@/services/supabase';
import { CommunityPost, PostVisibility } from '@/types/models';

// Where the reader is in a ranked session. `sessionId` null means "build a new
// session" — the snapshot is the pagination (migration 066), so there is no
// cursor to carry.
export type FeedPageParam = {
  sessionId: string | null;
  tier: number;
  offset: number;
  // Carried in the page param, not just read off the rows. session_id and
  // session_total ride on every ROW of a response, so a page that comes back
  // EMPTY carries neither — and an empty page is a normal occurrence, because
  // community_feed_page is SECURITY INVOKER and RLS can drop every id in a
  // slice that was moderated after the snapshot was taken. Without this field
  // the pager reads session_total as 0 and concludes the session is exhausted,
  // silently skipping the rest of it.
  //
  // Not sent to the RPC (see getCommunityFeed below) — this is client-side
  // bookkeeping only. Do not "fix" that by passing it as p_session_total; the
  // RPC has no such parameter and doesn't need one.
  sessionTotal: number | null;
};

// Kept for user_posts / get_post, which still paginate by keyset.
export type FeedCursor = { createdAt: string; id: string };

// True only when this call is building a session (never on a continuation
// page) for tier 1 — the tail of the feed is never the right place for the
// viewer's own post to reappear on top.
function shouldPin(tier: number, pinOwn: boolean): boolean {
  return tier === 1 && pinOwn;
}

// community_feed_page (066) raises no_data_found when p_session_id points at a
// session the 6-hour TTL already pruned, or one built for a different user.
// supabase-js resolves that as { data: null, error } — an RPC error never
// rejects the promise — and postgrest-js puts the raised SQLSTATE on
// `error.code` ('P0002' for no_data_found). PostgREST is likely to surface
// that as a 500 rather than a 4xx, so an HTTP-status check would be
// unreliable; matching `code` is the stable signal. The message check is a
// defensive fallback only, in case something upstream strips `code`.
function isExpiredSessionError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null | undefined;
  if (!e) return false;
  if (e.code === 'P0002') return true;
  return typeof e.message === 'string' && /not found or expired/i.test(e.message);
}

export async function getCommunityFeed(params: {
  userId: string;
  page: FeedPageParam;
  // Whether this build should float the viewer's own <5-minute-old posts to the
  // top. Only consulted when a session is actually being built.
  pinOwn: boolean;
  limit?: number;
}): Promise<CommunityPost[]> {
  const limit = params.limit ?? 10;
  // Two conditions, both required. A continuation page has nothing to pin, and
  // a tier-2+ build is the tail of the feed — the last place your own post
  // should reappear on top.
  const pinning =
    params.page.sessionId === null && shouldPin(params.page.tier, params.pinOwn);

  const { data, error } = await supabase.rpc('community_feed_page', {
    p_user_id: params.userId,
    p_session_id: params.page.sessionId,
    p_tier: params.page.tier,
    p_pin_own: pinning,
    p_offset: params.page.offset,
    p_limit: limit,
  });
  if (!error) return (data ?? []) as CommunityPost[];

  // Self-heal exactly once: only when we actually sent a session id. A null
  // sessionId hitting this branch means the build itself failed — a genuine
  // outage — and retrying with the same null params would just loop.
  if (params.page.sessionId !== null && isExpiredSessionError(error)) {
    const retry = await supabase.rpc('community_feed_page', {
      p_user_id: params.userId,
      p_session_id: null,
      p_tier: params.page.tier,
      p_pin_own: shouldPin(params.page.tier, params.pinOwn),
      // The rebuilt session is a different ranking than the expired one, so
      // resuming at the old offset would land in an unrelated part of the new
      // list. The only coherent place to resume is the top.
      p_offset: 0,
      p_limit: limit,
    });
    if (retry.error) throw retry.error;
    return (retry.data ?? []) as CommunityPost[];
  }

  throw error;
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

// One post for the detail screen (deep link / notification tap). Returns null
// when the viewer can't see it (RLS) or it's hidden — same community_feed shape.
export async function getPost(
  postId: string,
  viewerId: string
): Promise<CommunityPost | null> {
  const { data, error } = await supabase.rpc('get_post', {
    p_post_id: postId,
    p_user_id: viewerId,
  });
  if (error) throw error;
  const rows = (data ?? []) as CommunityPost[];
  return rows[0] ?? null;
}

export async function createTextPost(params: {
  authorId: string;
  body: string;
  visibility: PostVisibility;
  city: string | null;
  // An event of the author's to link (migration 070). posts_insert rejects an
  // event they neither host nor attend, so this cannot be spoofed client-side.
  refEventId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: params.authorId,
      type: 'text',
      body: params.body.trim(),
      visibility: params.visibility,
      city: params.city,
      ref_event_id: params.refEventId ?? null,
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
  refEventId?: string | null;
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
      ref_event_id: params.refEventId ?? null,
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
