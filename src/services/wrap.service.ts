import { supabase } from './supabase';
import {
  CoAttendee,
  EventFeedbackSummary,
  ExploreWrap,
  NearbyEvent,
  PhotoReportReason,
  Profile,
  PublicWrapPhoto,
  SuperlativeCategory,
  WrapNote,
  WrapPhoto,
  WrapPhotoComment,
  WrapStatus,
  WrapSummary,
} from '@/types/models';

// When an event counts as over, mirroring wrap_end_at() in migration 032.
export function wrapEndAt(event: {
  starts_at: string;
  ends_at: string | null;
}): Date {
  if (event.ends_at) return new Date(event.ends_at);
  return new Date(new Date(event.starts_at).getTime() + 4 * 60 * 60 * 1000);
}

export function hasWrapped(event: {
  starts_at: string;
  ends_at: string | null;
}): boolean {
  return wrapEndAt(event).getTime() <= Date.now();
}

// Contribution window: 7 days after the end (matches wrap_window_open()).
export function wrapWindowOpen(event: {
  starts_at: string;
  ends_at: string | null;
}): boolean {
  const end = wrapEndAt(event).getTime();
  return end <= Date.now() && Date.now() < end + 7 * 24 * 60 * 60 * 1000;
}

// ── Attendees & ratings ──────────────────────────────────────────────────────

// Everyone who was at the event (approved participants + host), minus me.
export async function getCoAttendees(
  eventId: string,
  userId: string
): Promise<CoAttendee[]> {
  const [{ data: event, error: eventErr }, { data: parts, error: partsErr }] =
    await Promise.all([
      supabase
        .from('events')
        .select('host_id, host:profiles!host_id(*)')
        .eq('id', eventId)
        .single(),
      supabase
        .from('event_participants')
        .select('user_id, status, profile:profiles(*)')
        .eq('event_id', eventId)
        .eq('status', 'approved'),
    ]);

  if (eventErr) throw eventErr;
  if (partsErr) throw partsErr;

  const toCoAttendee = (p: Profile, isHost: boolean): CoAttendee => ({
    id: p.id,
    name: p.name,
    username: p.username,
    photo_url: p.photo_url,
    age: p.age,
    bio: p.bio,
    thumbs_count: p.thumbs_count,
    kyc_status: p.kyc_status,
    isHost,
  });

  const list: CoAttendee[] = [];
  const host = (event as any)?.host as Profile | null;
  if (host && host.id !== userId) list.push(toCoAttendee(host, true));
  for (const row of parts ?? []) {
    const p = (row as any).profile as Profile | null;
    if (p && p.id !== userId && p.id !== (event as any)?.host_id) {
      list.push(toCoAttendee(p, false));
    }
  }
  return list;
}

export async function getMyRatings(
  eventId: string,
  userId: string
): Promise<{ ratee_id: string; rating: 'up' | 'down' }[]> {
  const { data, error } = await supabase
    .from('event_ratings')
    .select('ratee_id, rating')
    .eq('event_id', eventId)
    .eq('rater_id', userId);

  if (error) throw error;
  return (data ?? []) as { ratee_id: string; rating: 'up' | 'down' }[];
}

export async function rateAttendee(
  eventId: string,
  raterId: string,
  rateeId: string,
  rating: 'up' | 'down'
): Promise<void> {
  const { error } = await supabase.from('event_ratings').insert({
    event_id: eventId,
    rater_id: raterId,
    ratee_id: rateeId,
    rating,
  });

  if (error && error.code !== '23505') throw error; // already rated is fine
}

// Undo in the rating deck.
export async function unrateAttendee(
  eventId: string,
  raterId: string,
  rateeId: string
): Promise<void> {
  const { error } = await supabase
    .from('event_ratings')
    .delete()
    .eq('event_id', eventId)
    .eq('rater_id', raterId)
    .eq('ratee_id', rateeId);

  if (error) throw error;
}

// ── Notes ────────────────────────────────────────────────────────────────────

export async function sendWrapNote(args: {
  eventId: string;
  senderId: string;
  recipientId: string;
  content: string;
  photoUrl?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('wrap_notes').insert({
    event_id: args.eventId,
    sender_id: args.senderId,
    recipient_id: args.recipientId,
    content: args.content,
    photo_url: args.photoUrl ?? null,
  });

  if (error) throw error;
}

// Notes I received, unopened first, with sender + event title for the reveal.
export async function getReceivedNotes(userId: string): Promise<WrapNote[]> {
  const { data, error } = await supabase
    .from('wrap_notes')
    .select('*, sender:profiles!sender_id(*), event:events(title)')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    eventTitle: row.event?.title,
  })) as WrapNote[];
}

export async function markNoteOpened(noteId: string): Promise<void> {
  const { error } = await supabase
    .from('wrap_notes')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', noteId);

  if (error) throw error;
}

// ── Photo pool ───────────────────────────────────────────────────────────────

export async function getWrapPhotos(eventId: string): Promise<WrapPhoto[]> {
  const { data, error } = await supabase
    .from('event_photos')
    .select('*, uploader:profiles!uploader_id(*)')
    .eq('event_id', eventId)
    .order('like_count', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as WrapPhoto[];
}

export async function addWrapPhoto(args: {
  eventId: string;
  uploaderId: string;
  url: string;
  caption?: string | null;
  mentions?: string[];
}): Promise<void> {
  const { error } = await supabase.from('event_photos').insert({
    event_id: args.eventId,
    uploader_id: args.uploaderId,
    url: args.url,
    caption: args.caption?.trim() || null,
    mentions: args.mentions ?? [],
  });

  if (error) throw error;
}

export async function deleteWrapPhoto(photoId: string): Promise<void> {
  const { error } = await supabase
    .from('event_photos')
    .delete()
    .eq('id', photoId);

  if (error) throw error;
}

export async function getMyPhotoLikes(
  eventId: string,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('wrap_photo_likes')
    .select('photo_id, photo:event_photos!inner(event_id)')
    .eq('user_id', userId)
    .eq('photo.event_id', eventId);

  if (error) throw error;
  return (data ?? []).map((r: any) => r.photo_id);
}

export async function likePhoto(photoId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('wrap_photo_likes')
    .insert({ photo_id: photoId, user_id: userId });

  if (error && error.code !== '23505') throw error;
}

export async function unlikePhoto(
  photoId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('wrap_photo_likes')
    .delete()
    .eq('photo_id', photoId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function getPhotoComments(
  photoIds: string[]
): Promise<WrapPhotoComment[]> {
  if (photoIds.length === 0) return [];
  const { data, error } = await supabase
    .from('wrap_photo_comments')
    .select('*, author:profiles!user_id(*)')
    .in('photo_id', photoIds)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as WrapPhotoComment[];
}

export async function commentPhoto(args: {
  photoId: string;
  userId: string;
  content: string;
  mentions?: string[];
}): Promise<void> {
  const { error } = await supabase.from('wrap_photo_comments').insert({
    photo_id: args.photoId,
    user_id: args.userId,
    content: args.content.trim(),
    mentions: args.mentions ?? [],
  });

  if (error) throw error;
}

export async function reportPhoto(args: {
  photoId: string;
  reporterId: string;
  reason: PhotoReportReason;
  details?: string;
}): Promise<void> {
  const { error } = await supabase.from('wrap_photo_reports').insert({
    photo_id: args.photoId,
    reporter_id: args.reporterId,
    reason: args.reason,
    details: args.details ?? null,
  });

  if (error) throw error;
}

// ── Superlatives ─────────────────────────────────────────────────────────────

export async function getMyVotes(
  eventId: string,
  userId: string
): Promise<{ category: SuperlativeCategory; votee_id: string }[]> {
  const { data, error } = await supabase
    .from('superlative_votes')
    .select('category, votee_id')
    .eq('event_id', eventId)
    .eq('voter_id', userId);

  if (error) throw error;
  return (data ?? []) as { category: SuperlativeCategory; votee_id: string }[];
}

export async function voteSuperlative(args: {
  eventId: string;
  category: SuperlativeCategory;
  voterId: string;
  voteeId: string;
}): Promise<void> {
  const { error } = await supabase.from('superlative_votes').upsert(
    {
      event_id: args.eventId,
      category: args.category,
      voter_id: args.voterId,
      votee_id: args.voteeId,
    },
    { onConflict: 'event_id,category,voter_id' }
  );

  if (error) throw error;
}

// ── Host feedback ────────────────────────────────────────────────────────────

export async function submitEventFeedback(args: {
  eventId: string;
  userId: string;
  rating: 'up' | 'down';
  note?: string;
}): Promise<void> {
  const { error } = await supabase.from('event_feedback').upsert(
    {
      event_id: args.eventId,
      user_id: args.userId,
      rating: args.rating,
      note: args.note?.trim() || null,
    },
    { onConflict: 'event_id,user_id' }
  );

  if (error) throw error;
}

// Host-only anonymous aggregate (RPC, migration 033).
export async function getEventFeedback(
  eventId: string
): Promise<EventFeedbackSummary | null> {
  const { data, error } = await supabase.rpc('get_event_feedback', {
    p_event_id: eventId,
  });

  if (error) throw error;
  return data as EventFeedbackSummary | null;
}

// ── Encore ───────────────────────────────────────────────────────────────────

export async function requestEncore(
  eventId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('encore_requests')
    .insert({ event_id: eventId, user_id: userId });

  if (error && error.code !== '23505') throw error;
}

export async function withdrawEncore(
  eventId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('encore_requests')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId);

  if (error) throw error;
}

// ── Status, views, recap ─────────────────────────────────────────────────────

// Everything the checklist needs, fetched in parallel.
export async function getWrapStatus(
  eventId: string,
  userId: string
): Promise<WrapStatus> {
  const [
    coAttendees,
    ratings,
    { count: myPhotoCount, error: photosErr },
    votes,
    { data: feedback, error: feedbackErr },
    { data: view, error: viewErr },
    { data: encores, error: encoreErr },
    { data: event, error: eventErr },
  ] = await Promise.all([
    getCoAttendees(eventId, userId),
    getMyRatings(eventId, userId),
    supabase
      .from('event_photos')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('uploader_id', userId),
    getMyVotes(eventId, userId),
    supabase
      .from('event_feedback')
      .select('event_id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('wrap_views')
      .select('view_count')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('encore_requests').select('user_id').eq('event_id', eventId),
    supabase.from('events').select('host_id').eq('id', eventId).single(),
  ]);

  if (photosErr) throw photosErr;
  if (feedbackErr) throw feedbackErr;
  if (viewErr) throw viewErr;
  if (encoreErr) throw encoreErr;
  if (eventErr) throw eventErr;

  return {
    coAttendeeCount: coAttendees.length,
    ratedCount: ratings.length,
    myPhotoCount: myPhotoCount ?? 0,
    votedCategories: votes.map((v) => v.category),
    feedbackDone: !!feedback,
    isHost: (event as any)?.host_id === userId,
    viewCount: (view as any)?.view_count ?? 0,
    encoreRequested: (encores ?? []).some((e: any) => e.user_id === userId),
    encoreCount: (encores ?? []).length,
  };
}

export async function bumpWrapView(eventId: string): Promise<number> {
  const { data, error } = await supabase.rpc('bump_wrap_view', {
    p_event_id: eventId,
  });

  if (error) throw error;
  return (data as number) ?? 1;
}

export async function getWrapSummary(
  eventId: string
): Promise<WrapSummary | null> {
  const { data, error } = await supabase.rpc('get_wrap_summary', {
    p_event_id: eventId,
  });

  if (error) throw error;
  return data as WrapSummary | null;
}

// ── Explore surfaces ─────────────────────────────────────────────────────────

export async function getExploreWraps(args: {
  limit: number;
  offset: number;
}): Promise<ExploreWrap[]> {
  const { data, error } = await supabase.rpc('get_explore_wraps', {
    p_limit: args.limit,
    p_offset: args.offset,
  });

  if (error) throw error;
  return (data ?? []) as ExploreWrap[];
}

export async function getPublicWrap(
  eventId: string
): Promise<PublicWrapPhoto[]> {
  const { data, error } = await supabase.rpc('get_public_wrap', {
    p_event_id: eventId,
  });

  if (error) throw error;
  return (data ?? []) as PublicWrapPhoto[];
}

// The most recently ended event I attended (last 7 days) — powers the
// "Wrap up last night" entry cards on Home and Explore.
export async function getLatestWrappableEvent(
  userId: string
): Promise<NearbyEvent | null> {
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [{ data: joined, error: joinedErr }, { data: hosted, error: hostedErr }] =
    await Promise.all([
      supabase
        .from('event_participants')
        .select('event:events(*)')
        .eq('user_id', userId)
        .eq('status', 'approved'),
      supabase
        .from('events')
        .select('*')
        .eq('host_id', userId)
        .gte('starts_at', sevenDaysAgo),
    ]);

  if (joinedErr) throw joinedErr;
  if (hostedErr) throw hostedErr;

  const candidates: any[] = [
    ...(joined ?? []).map((r: any) => r.event).filter(Boolean),
    ...(hosted ?? []),
  ];

  const wrapped = candidates.filter((e) => {
    const end = wrapEndAt(e).getTime();
    return (
      end <= Date.now() && end > Date.now() - 7 * 24 * 60 * 60 * 1000
    );
  });

  if (wrapped.length === 0) return null;
  wrapped.sort((a, b) => wrapEndAt(b).getTime() - wrapEndAt(a).getTime());
  return wrapped[0] as NearbyEvent;
}
