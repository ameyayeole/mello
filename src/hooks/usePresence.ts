import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

export function usePresence() {
  const userId = useAuthStore((s) => s.user?.id);
  const ghostMode = useUIStore((s) => s.ghostMode);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel('online-users');

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ userId: string }>();
        const ids = new Set(
          Object.values(state)
            .flat()
            .map((p) => p.userId)
        );
        setOnlineIds(ids);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !ghostMode) {
          await channel.track({ userId });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [userId, ghostMode]);

  const isOnline = (id: string) => onlineIds.has(id);

  return { onlineIds, isOnline };
}
