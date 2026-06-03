import { supabase } from './supabase';
import { Coords, NearbyEvent, EventDetail, ActivityId } from '@/types/models';

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

export async function getEventDetail(eventId: string): Promise<EventDetail> {
  const { data, error } = await supabase
    .from('events')
    .select(`
      *,
      host:profiles!host_id(*),
      participants:event_participants(user:profiles(*))
    `)
    .eq('id', eventId)
    .single();

  if (error) throw error;

  const participants = ((data as any).participants ?? []).map(
    (p: any) => p.user
  );

  return {
    ...(data as any),
    participants,
    participant_count: participants.length,
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
}): Promise<string> {
  const { data, error } = await supabase
    .from('events')
    .insert({
      host_id: params.hostId,
      activity: params.activity,
      title: params.title,
      description: params.description,
      location: `SRID=4326;POINT(${params.lng} ${params.lat})`,
      location_name: params.locationName,
      starts_at: params.startsAt.toISOString(),
      ends_at: params.endsAt?.toISOString(),
      max_people: params.maxPeople,
      is_public: params.isPublic,
    })
    .select('id')
    .single();

  if (error) throw error;
  return (data as any).id as string;
}

export async function joinEvent(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('event_participants')
    .insert({ event_id: eventId, user_id: userId });

  if (error) throw error;
}

export async function leaveEvent(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('event_participants')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function saveEvent(userId: string, eventId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_events')
    .insert({ user_id: userId, event_id: eventId });

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
  const { event_participants, ...rest } = row ?? {};
  return { ...rest, participant_count: count } as NearbyEvent;
}

export async function getMyEvents(userId: string): Promise<NearbyEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*, event_participants(count)')
    .eq('host_id', userId)
    .eq('is_active', true)
    .order('starts_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as any[]).map(withParticipantCount);
}

export async function getJoinedEvents(userId: string): Promise<NearbyEvent[]> {
  const { data, error } = await supabase
    .from('event_participants')
    .select('event:events(*, event_participants(count))')
    .eq('user_id', userId);

  if (error) throw error;
  return ((data ?? []) as any[])
    .map((r) => r.event)
    .filter(Boolean)
    .map(withParticipantCount);
}
