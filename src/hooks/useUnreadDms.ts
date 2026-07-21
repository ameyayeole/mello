import { useQuery } from '@tanstack/react-query';
import { getUnreadDmCount } from '@/services/dm.service';
import { queryKeys } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';

/**
 * Unread DM count for the Inbox tab badge.
 *
 * Deliberately just a read — no realtime subscription of its own. This runs
 * inside `tabBarIcon`, which React Navigation may render more than once, and
 * two instances opening `supabase.channel('unreadDms:<userId>')` collide: the
 * second gets back the already-subscribed channel and `.on()` throws "cannot
 * add postgres_changes callbacks after subscribe()". A component that can
 * exist twice cannot own a channel keyed by a value it shares.
 *
 * Two things move this number, and both invalidate from somewhere mounted
 * exactly once:
 *
 * - a DM arrives → `direct_messages` INSERT fires the `on_direct_message`
 *   trigger (migration 030), which writes a notification row; `useNotifications`
 *   in the root layout is subscribed to those and invalidates.
 * - you read a thread → `useDirectChat` invalidates after `markDmRead`.
 *
 * The gap: a *muted* DM writes no notification row, so the badge for a muted
 * thread catches up on the next refetch rather than live. That matches what
 * muting is for.
 */
export function useUnreadDms(): number {
  const userId = useAuthStore((s) => s.user?.id);

  const { data } = useQuery({
    queryKey: queryKeys.unreadDms.of(userId),
    queryFn: () => getUnreadDmCount(userId!),
    enabled: !!userId,
  });

  return data ?? 0;
}
