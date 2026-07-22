import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

// Who has the app open, over one Supabase presence channel.
//
// **One channel for the whole app, shared between every caller** and refcounted
// here, rather than one opened per component. `supabase.channel(name)` hands
// back the *existing* channel when one by that name is already in the client's
// registry, and calling `.on()` on a channel that has already subscribed throws
// outright:
//
//   cannot add `presence` callbacks for realtime:online-users after `subscribe()`
//
// That is fatal, not a warning — it took the Inbox down with a render error the
// moment a second screen started using this hook. The same trap is written up
// in useEventChat, which dodges it by clearing stale channels before opening
// its own; that works there because only one event chat is ever on screen.
// Presence is now on three (Friends, the Inbox, a DM thread) and they overlap,
// so the subscription has to be genuinely shared.
//
// The teardown uses `removeChannel`, not `unsubscribe`: only the former drops
// the channel from the client's registry. With `unsubscribe` alone the next
// mount is handed the same dead channel and throws all over again.

type Listener = (ids: Set<string>) => void;

let channel: ReturnType<typeof supabase.channel> | null = null;
let refCount = 0;
let onlineIds = new Set<string>();
const listeners = new Set<Listener>();

function publish(ids: Set<string>) {
  onlineIds = ids;
  for (const listener of listeners) listener(ids);
}

function open(userId: string, ghostMode: boolean) {
  if (channel) return;
  const live = supabase.channel('online-users');
  channel = live;

  live
    .on('presence', { event: 'sync' }, () => {
      const state = live.presenceState<{ userId: string }>();
      publish(
        new Set(
          Object.values(state)
            .flat()
            .map((p) => p.userId)
        )
      );
    })
    .subscribe(async (status) => {
      // Ghost mode watches, but is not seen.
      if (status === 'SUBSCRIBED' && !ghostMode) await live.track({ userId });
    });
}

function close() {
  if (!channel) return;
  supabase.removeChannel(channel);
  channel = null;
  publish(new Set());
}

export function usePresence() {
  const userId = useAuthStore((s) => s.user?.id);
  const ghostMode = useUIStore((s) => s.ghostMode);
  // Seeded from what the shared channel already knows, so a screen mounting
  // second doesn't blink through an empty state waiting for the next sync.
  const [ids, setIds] = useState<Set<string>>(() => onlineIds);

  useEffect(() => {
    if (!userId) return;

    listeners.add(setIds);
    refCount += 1;
    open(userId, ghostMode);

    return () => {
      listeners.delete(setIds);
      refCount -= 1;
      // The last screen out turns the channel off. Anything else and moving
      // between two screens that both want presence would tear down a
      // subscription the other one is still using.
      if (refCount === 0) close();
    };
  }, [userId, ghostMode]);

  const isOnline = (id: string) => ids.has(id);

  return { onlineIds: ids, isOnline };
}
