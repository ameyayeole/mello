import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { getNearbyEvents } from '@/services/events.service';
import { useLocationStore } from '@/stores/locationStore';
import { useUIStore } from '@/stores/uiStore';
import { CONFIG } from '@/constants/config';

// What part of the world to search. The map passes its visible region so pins
// load for the area being looked at, not just around the user's GPS position.
export interface SearchCenter {
  lat: number;
  lng: number;
  radiusM: number;
}

export function useNearbyEvents(center?: SearchCenter | null) {
  const coords = useLocationStore((s) => s.coords);
  const activities = useUIStore((s) => s.mapFilters.activities);
  const searchRadius = useUIStore((s) => s.searchRadius);

  // A single selected activity can be filtered server-side; multi-selection is
  // filtered client-side by the map, so fetch everything.
  const serverActivity = activities.length === 1 ? activities[0] : null;

  const target =
    center ??
    (coords
      ? { lat: coords.lat, lng: coords.lng, radiusM: searchRadius }
      : null);

  // Round the key so tiny pan jitters reuse the cache (~100 m buckets).
  const keyLat = target ? Math.round(target.lat * 1000) / 1000 : null;
  const keyLng = target ? Math.round(target.lng * 1000) / 1000 : null;

  return useQuery({
    queryKey: [
      'events',
      'nearby',
      keyLat,
      keyLng,
      target?.radiusM,
      serverActivity,
    ],
    queryFn: () =>
      getNearbyEvents(
        { lat: target!.lat, lng: target!.lng },
        target!.radiusM,
        serverActivity ?? undefined
      ),
    enabled: !!target,
    staleTime: CONFIG.mapStaletimeMs,
    refetchInterval: CONFIG.mapRefetchIntervalMs,
    // Panning changes the query key (new ~100 m bucket); keep the previous
    // pins on screen while the new area loads instead of unmounting them all —
    // otherwise every pan makes the markers blink out and pop back in.
    placeholderData: keepPreviousData,
  });
}
