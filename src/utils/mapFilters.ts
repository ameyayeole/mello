import { ActivityId, Coords, NearbyEvent } from '@/types/models';

// Map filter model. Everything here is applied client-side over the events the
// map already fetched for its visible region, so no new RPC params are needed.
// The one exception: when exactly one activity is selected, useNearbyEvents
// also passes it server-side to keep the payload small.

export type TimeWindow = 'any' | 'now' | 'today' | 'tomorrow' | 'week';
export type GroupSize = 'any' | 'small' | 'medium' | 'large';

export interface MapFilters {
  // Empty array = all activities.
  activities: ActivityId[];
  when: TimeWindow;
  // Metres from the user's GPS position (not the map center); null = anywhere.
  maxDistanceM: number | null;
  // Hide events that already hit max_people.
  hasSpotsOnly: boolean;
  // Only events joinable without host approval.
  instantJoinOnly: boolean;
  // Only women-only events (migration 018).
  womenOnly: boolean;
  // Only events hosted by an accepted friend.
  friendsOnly: boolean;
  groupSize: GroupSize;
}

export const DEFAULT_MAP_FILTERS: MapFilters = {
  activities: [],
  when: 'any',
  maxDistanceM: null,
  hasSpotsOnly: false,
  instantJoinOnly: false,
  womenOnly: false,
  friendsOnly: false,
  groupSize: 'any',
};

// How many filter groups differ from the defaults — shown as the badge on the
// map's filter button. Activity chips are visible on the map itself, so they
// don't count towards the badge.
export function countActiveMapFilters(f: MapFilters): number {
  let n = 0;
  if (f.when !== 'any') n++;
  if (f.maxDistanceM !== null) n++;
  if (f.hasSpotsOnly) n++;
  if (f.instantJoinOnly) n++;
  if (f.womenOnly) n++;
  if (f.friendsOnly) n++;
  if (f.groupSize !== 'any') n++;
  return n;
}

function haversineM(a: Coords, b: Coords): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// The RPC only returns active events, so windows just bound starts_at.
function inTimeWindow(e: NearbyEvent, when: TimeWindow, now: Date): boolean {
  if (when === 'any') return true;
  const starts = new Date(e.starts_at);
  if (when === 'now') {
    const ended = e.ends_at ? new Date(e.ends_at) <= now : false;
    return starts <= now && !ended;
  }
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  if (when === 'today') return starts <= endOfToday;
  if (when === 'tomorrow') {
    const endOfTomorrow = new Date(endOfToday);
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
    return starts > endOfToday && starts <= endOfTomorrow;
  }
  // week
  const weekOut = new Date(now);
  weekOut.setDate(weekOut.getDate() + 7);
  return starts <= weekOut;
}

// Sized by the host's cap; no cap counts as a large open hangout.
function inGroupSize(e: NearbyEvent, size: GroupSize): boolean {
  if (size === 'any') return true;
  if (e.max_people == null) return size === 'large';
  if (size === 'small') return e.max_people <= 5;
  if (size === 'medium') return e.max_people > 5 && e.max_people <= 15;
  return e.max_people > 15;
}

export function applyMapFilters(
  events: NearbyEvent[],
  f: MapFilters,
  opts: { coords: Coords | null; friendIds: Set<string> }
): NearbyEvent[] {
  const now = new Date();
  return events.filter((e) => {
    if (f.activities.length > 0 && !f.activities.includes(e.activity))
      return false;
    if (!inTimeWindow(e, f.when, now)) return false;
    if (
      f.maxDistanceM !== null &&
      opts.coords &&
      haversineM(opts.coords, { lat: e.lat, lng: e.lng }) > f.maxDistanceM
    )
      return false;
    if (
      f.hasSpotsOnly &&
      e.max_people != null &&
      e.participant_count >= e.max_people
    )
      return false;
    if (f.instantJoinOnly && e.requires_approval) return false;
    if (f.womenOnly && !e.women_only) return false;
    if (f.friendsOnly && !opts.friendIds.has(e.host_id)) return false;
    if (!inGroupSize(e, f.groupSize)) return false;
    return true;
  });
}
