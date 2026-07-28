import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getWrapCard } from '@/services/wrap.service';

// Preview data for a shared_wrap card. Wrap content rarely changes after the
// event, so a long staleTime is fine.
export function useWrapCard(eventId: string) {
  return useQuery({
    queryKey: queryKeys.community.wrapCard.of(eventId),
    queryFn: () => getWrapCard(eventId),
    staleTime: 5 * 60_000,
  });
}
