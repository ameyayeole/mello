import { supabase } from './supabase';
import { ilikePattern } from '@/utils/postgrest';
import {
  Coords,
  NearbyEvent,
  EventDetail,
  ExploreEvent,
  SavedEventItem,
  ActivityId,
  ParticipantStatus,
  Profile,
} from '@/types/models';

// One page of the ranked Explore feed. Pass coords when known so proximity can
// factor into the score; pass an activity to filter the feed.
export async function getExploreFeed(params: {
  userId: string;
  coords?: Coords | null;
  activity?: ActivityId;
  limit?: number;
  offset?: number;
  // Explore "🔥 Hot" tab: only currently-boosted events (migration 026).
  boostedOnly?: boolean;
}): Promise<ExploreEvent[]> {
  const { data, error } = await supabase.rpc('explore_feed', {
    p_user_id: params.userId,
    user_lat: params.coords?.lat ?? null,
    user_lng: params.coords?.lng ?? null,
    activity_filter: params.activity ?? null,
    p_limit: params.limit ?? 10,
    p_offset: params.offset ?? 0,
    p_boosted_only: params.boostedOnly ?? false,
  });

  if (error) throw error;
  // Never surface your own events in a discovery feed — you can't "join" a
  // plan you're hosting. Hosted events live in the "You're hosting" section.
  return ((data ?? []) as ExploreEvent[]).filter(
    (e) => e.host_id !== params.userId
  );
}

export async function getNearbyEvents(
  coords: Coords,
  radiusMeters: number,
  activityFilter?: ActivityId
): Promise<NearbyEvent[]> {
  const { data, error } = await supabase.rpc('events_within_radius', {
    user_lat: coords.lat,
    user_lng: coords.lng,
    radius_m: radiusMeters,
    activity_filter: activityFilter ?? null,
  });

  if (error) throw error;
  return (data ?? []) as NearbyEvent[];
}

// Title/location text search over upcoming public events, for the search
// screen. Returned rows come straight from the events table, so the geo fields
// (lat/lng/distance_m) are absent — search results don't need them.
export async function searchEvents(query: string): Promise<NearbyEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, host_id, activity, title, description, image_url, location_name, starts_at, ends_at, max_people, is_public, requires_approval, boosted_until'
    )
    .eq('is_active', true)
    .eq('is_public', true)
    .or(
      `title.ilike.${ilikePattern(query)},location_name.ilike.${ilikePattern(query)}`
    )
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
    // Boosted events surface first, then soonest.
    .order('boosted_until', { ascending: false, nullsFirst: false })
    .order('starts_at', { ascending: true })
    .limit(20);

  if (error) throw error;
  return (data ?? []) as unknown as NearbyEvent[];
}

export async function getEventDetail(eventId: string): Promise<EventDetail> {
  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      host:profiles!host_id(*),
      participants:event_participants(status, user:profiles!event_participants_user_id_fkey(*))
    `)
    .eq('id', eventId)
    .single();

  if (error) throw error;

  // Flatten participants and attach each one's join status.
  const participants = ((data as any).participants ?? []).map((p: any) => ({
    ...p.user,
    status: p.status ?? 'approved',
  }));
  const approvedCount = participants.filter(
    (p: any) => p.status === 'approved'
  ).length;

  return {
    ...(data as any),
    participants,
    participant_count: approvedCount,
  } as EventDetail;
}

export async function createEvent(params: {
  hostId: string;
  activity: ActivityId;
  title: string;
  description?: string;
  lat: number;
  lng: number;
  locationName?: string;
  startsAt: Date;
  endsAt?: Date;
  maxPeople?: number;
  isPublic: boolean;
  requiresApproval: boolean;
  womenOnly?: boolean;
  imageUrl?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('events')
    .insert({
      host_id: params.hostId,
      activity: params.activity,
      title: params.title,
      description: params.description,
      image_url: params.imageUrl,
      location: `SRID=4326;POINT(${params.lng} ${params.lat})`,
      location_name: params.locationName,
      starts_at: params.startsAt.toISOString(),
      ends_at: params.endsAt?.toISOString(),
      max_people: params.maxPeople,
      is_public: params.isPublic,
      requires_approval: params.requiresApproval,
      // Only sent when set, so creating regular events still works before
      // migration 018 adds the column.
      ...(params.womenOnly ? { women_only: true } : {}),
    })
    .select('id')
    .single();

  if (error) throw error;
  return (data as any).id as string;
}

// Host edits an existing event. Only the fields provided are updated; the
// location is only touched when both lat and lng are passed (the edit screen
// leaves it out when the pin wasn't moved).
export async function updateEvent(
  eventId: string,
  params: {
    activity?: ActivityId;
    title?: string;
    description?: string | null;
    imageUrl?: string | null;
    lat?: number;
    lng?: number;
    locationName?: string | null;
    startsAt?: Date;
    endsAt?: Date | null;
    maxPeople?: number | null;
    isPublic?: boolean;
    requiresApproval?: boolean;
    womenOnly?: boolean;
  }
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (params.activity !== undefined) patch.activity = params.activity;
  if (params.title !== undefined) patch.title = params.title;
  if (params.description !== undefined) patch.description = params.description;
  if (params.imageUrl !== undefined) patch.image_url = params.imageUrl;
  if (params.lat !== undefined && params.lng !== undefined) {
    patch.location = `SRID=4326;POINT(${params.lng} ${params.lat})`;
  }
  if (params.locationName !== undefined)
    patch.location_name = params.locationName;
  if (params.startsAt !== undefined)
    patch.starts_at = params.startsAt.toISOString();
  if (params.endsAt !== undefined)
    patch.ends_at = params.endsAt?.toISOString() ?? null;
  if (params.maxPeople !== undefined) patch.max_people = params.maxPeople;
  if (params.isPublic !== undefined) patch.is_public = params.isPublic;
  if (params.requiresApproval !== undefined)
    patch.requires_approval = params.requiresApproval;
  if (params.womenOnly !== undefined) patch.women_only = params.womenOnly;

  const { error } = await supabase
    .from('events')
    .update(patch)
    .eq('id', eventId);

  if (error) throw error;
}

// Joins directly when the event is open, or creates a pending request when the
// event requires host approval.
export async function joinEvent(
  eventId: string,
  userId: string,
  requiresApproval = false
): Promise<void> {
  const { error } = await supabase.from('event_participants').insert({
    event_id: eventId,
    user_id: userId,
    status: requiresApproval ? 'pending' : 'approved',
  });

  if (error) throw error;
}

// Which join requests in a batch of events are *still* pending, as
// `${eventId}:${userId}` keys.
//
// The notifications screen offers Accept/Decline inline, and a notification row
// cannot answer this by itself: its payload is frozen at insert time, so a
// request approved last week still reads `pending: true` forever. Without this
// the Decline button on an already-approved row would silently remove a real
// attendee — the same row delete rejecting uses.
//
// One query for the whole list rather than an event fetch per row. RLS
// (`participants_select`, migration 003) exposes participant rows to the event's
// host, which is exactly who receives these notifications.
export async function getPendingRequestKeys(
  eventIds: string[]
): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('event_participants')
    .select('event_id, user_id')
    .in('event_id', eventIds)
    .eq('status', 'pending');

  if (error) throw error;
  return new Set((data ?? []).map((r) => `${r.event_id}:${r.user_id}`));
}

// Host approves a pending join request.
export async function approveParticipant(
  eventId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('event_participants')
    .update({ status: 'approved' })
    .eq('event_id', eventId)
    .eq('user_id', userId);

  if (error) throw error;
}

// Host rejects a pending request (removes the row).
export async function rejectParticipant(
  eventId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('event_participants')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId);

  if (error) throw error;
}

// Host removes an approved attendee — the same row delete as rejecting a
// pending request (RLS lets the host delete any participant row of their event).
export const removeParticipant = rejectParticipant;

export async function leaveEvent(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('event_participants')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId);

  if (error) throw error;
}

// ── Mello+ ───────────────────────────────────────────────────────────────────
// Distance between the user and an event, for the >10 km join gate. The event
// detail query (SELECT *) can't expose lat/lng from the geography column.
export async function getEventDistanceM(
  eventId: string,
  coords: Coords
): Promise<number | null> {
  const { data, error } = await supabase.rpc('event_distance_m', {
    p_event_id: eventId,
    p_lat: coords.lat,
    p_lng: coords.lng,
  });

  if (error) throw error;
  return data as number | null;
}

// How many swipes the user has spent today (the DB trigger caps free users).
export async function getTodaySwipeCount(userId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('event_swipes')
    .select('event_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', start.toISOString());

  if (error) throw error;
  return count ?? 0;
}

// Everyone who wishlisted this event. RLS only returns rows to the event's
// host when they're premium; other callers just get an empty list.
export async function getEventSavers(
  eventId: string
): Promise<Pick<Profile, 'id' | 'name' | 'photo_url'>[]> {
  const { data, error } = await supabase
    .from('saved_events')
    .select('user:profiles(id, name, photo_url)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => r.user).filter(Boolean);
}

// Wishlist count for the host's teaser — available to every host (the RPC
// checks host ownership), so free hosts see what Mello+ would unlock.
export async function countEventSavers(eventId: string): Promise<number> {
  const { data, error } = await supabase.rpc('count_event_savers', {
    p_event_id: eventId,
  });

  if (error) throw error;
  return (data as number) ?? 0;
}

// ── Swipe deck ───────────────────────────────────────────────────────────────
// One row per user/event judgement. Upsert so re-swiping an event (e.g. via a
// stale deck after a refetch) never throws on the primary key.
export async function recordSwipe(
  userId: string,
  eventId: string,
  direction: 'like' | 'pass'
): Promise<void> {
  const { error } = await supabase
    .from('event_swipes')
    .upsert(
      { user_id: userId, event_id: eventId, direction },
      { onConflict: 'user_id,event_id' }
    );

  if (error) throw error;
}

// Undo: forget the user's judgement so the event re-enters their deck.
export async function deleteSwipe(
  userId: string,
  eventId: string
): Promise<void> {
  const { error } = await supabase
    .from('event_swipes')
    .delete()
    .eq('user_id', userId)
    .eq('event_id', eventId);

  if (error) throw error;
}

export async function getSwipedEventIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('event_swipes')
    .select('event_id')
    .eq('user_id', userId);

  if (error) throw error;
  return (data ?? []).map((r: any) => r.event_id as string);
}

// Full event rows for the wishlist, newest save first, with the host and the
// approved attendees' names/photos so the cards can show "Hosted By …" and an
// avatar stack.
export async function getSavedEvents(
  userId: string
): Promise<SavedEventItem[]> {
  const { data, error } = await supabase
    .from('saved_events')
    .select(
      'created_at, event:events(*, host:profiles!host_id(id, name, photo_url), event_participants(status, user:profiles!event_participants_user_id_fkey(id, name, photo_url)))'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as any[])
    .map((r) => r.event)
    .filter((e) => e && e.is_active)
    .map((e) => {
      const attendees = ((e.event_participants ?? []) as any[])
        .filter((p) => p.status === 'approved' && p.user)
        .map((p) => p.user);
      const { event_participants: _ep, host, ...rest } = e;
      return {
        ...rest,
        host_name: host?.name,
        host_photo_url: host?.photo_url ?? null,
        attendees,
        participant_count: attendees.length,
      } as SavedEventItem;
    });
}

export async function saveEvent(userId: string, eventId: string): Promise<void> {
  // ignoreDuplicates = ON CONFLICT DO NOTHING: re-saving an already-saved
  // event is a no-op and never needs an UPDATE policy on saved_events.
  const { error } = await supabase
    .from('saved_events')
    .upsert(
      { user_id: userId, event_id: eventId },
      { onConflict: 'user_id,event_id', ignoreDuplicates: true }
    );

  if (error) throw error;
}

export async function unsaveEvent(userId: string, eventId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_events')
    .delete()
    .eq('user_id', userId)
    .eq('event_id', eventId);

  if (error) throw error;
}

export async function getSavedEventIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('saved_events')
    .select('event_id')
    .eq('user_id', userId);

  if (error) throw error;
  return (data ?? []).map((r: any) => r.event_id as string);
}

// Supabase returns aggregated counts as `event_participants: [{ count: N }]`.
function withParticipantCount(row: any): NearbyEvent {
  const count = row?.event_participants?.[0]?.count ?? 0;
  const { event_participants: _ep, host: hostRow, ...rest } = row ?? {};
  return {
    ...rest,
    participant_count: count,
    // Flattened to match what the feed RPCs return since migration 017, so
    // callers never have to care which query an event arrived from. Only
    // present when the caller asked for the join.
    ...(hostRow?.name ? { host_name: hostRow.name } : {}),
  } as NearbyEvent;
}

export async function getMyEvents(userId: string): Promise<NearbyEvent[]> {
  const { data, error } = await supabase
    .from('events')
    // The host join feeds the Inbox's "X is hosting this event" line.
    .select('*, event_participants(count), host:profiles!host_id(name)')
    .eq('host_id', userId)
    .eq('is_active', true)
    .order('starts_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as any[]).map(withParticipantCount);
}

/** The faces on an event card, plus the true number going. */
export interface AttendeePreview {
  attendees: Pick<Profile, 'id' | 'name' | 'photo_url'>[];
  going_count: number;
}

/**
 * Attendee previews for a batch of events, keyed by event id.
 *
 * Goes through the `event_attendees_preview` RPC rather than reading
 * `event_participants`, because that table is deny-by-default: RLS exposes only
 * your own rows and the rows of events you host. Read directly from a client,
 * "who is going" collapses to "just me" — which is also why participant counts
 * on cards read low. Migration 038 explains why the fix is a locked-down
 * function and not a looser policy.
 *
 * Returns `{}` rather than throwing if the function isn't there yet, so a
 * client running ahead of the migration degrades to counts-without-faces
 * instead of an error state.
 */
export async function getAttendeePreviews(
  eventIds: string[]
): Promise<Record<string, AttendeePreview>> {
  if (eventIds.length === 0) return {};

  const { data, error } = await supabase.rpc('event_attendees_preview', {
    p_event_ids: eventIds,
  });

  if (error) {
    console.warn('event_attendees_preview unavailable:', error.message);
    return {};
  }

  const byEvent: Record<string, AttendeePreview> = {};
  for (const row of (data ?? []) as any[]) {
    byEvent[row.event_id] = {
      attendees: row.attendees ?? [],
      going_count: row.going_count ?? 0,
    };
  }
  return byEvent;
}

/**
 * My participation status on every event I've asked to join, keyed by event id.
 *
 * `getJoinedEvents` deliberately returns approved rows only — a pending request
 * must not surface the event chat — which leaves nothing able to answer "have I
 * already requested this?". Cards need that to show "Requested" rather than
 * offering Join a second time.
 *
 * Ids and statuses only, no event rows: this is read alongside feeds that
 * already carry the events themselves.
 */
export async function getMyParticipation(
  userId: string
): Promise<Record<string, ParticipantStatus>> {
  const { data, error } = await supabase
    .from('event_participants')
    .select('event_id, status')
    .eq('user_id', userId);

  if (error) throw error;
  const byEvent: Record<string, ParticipantStatus> = {};
  for (const row of data ?? []) {
    byEvent[row.event_id] = row.status as ParticipantStatus;
  }
  return byEvent;
}

export async function getJoinedEvents(userId: string): Promise<NearbyEvent[]> {
  const { data, error } = await supabase
    .from('event_participants')
    .select(
      'event:events(*, event_participants(count), host:profiles!host_id(name))'
    )
    .eq('user_id', userId)
    // Only approved participants belong in chats — pending join requests
    // (awaiting host approval) must not show the event chat yet.
    .eq('status', 'approved');

  if (error) throw error;
  return ((data ?? []) as any[])
    .map((r) => r.event)
    .filter(Boolean)
    .map(withParticipantCount);
}
