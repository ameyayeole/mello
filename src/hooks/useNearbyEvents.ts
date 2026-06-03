import { useQuery } from '@tanstack/react-query';
import { getNearbyEvents } from '@/services/events.service';
import { useLocationStore } from '@/stores/locationStore';
import { useUIStore } from '@/stores/uiStore';
import { CONFIG } from '@/constants/config';

export function useNearbyEvents() {
  const coords = useLocationStore((s) => s.coords);
  const activeFilter = useUIStore((s) => s.activeFilter);
  const searchRadius = useUIStore((s) => s.searchRadius);

  return useQuery({
    queryKey: ['events', 'nearby', coords?.lat, coords?.lng, searchRadius, activeFilter],
    queryFn: () =>
      getNearbyEvents(coords!, searchRadius, activeFilter ?? undefined),
    enabled: !!coords,
    staleTime: CONFIG.mapStaletimeMs,
    refetchInterval: CONFIG.mapRefetchIntervalMs,
  });
}
