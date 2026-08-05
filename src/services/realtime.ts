import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';

// `supabase.channel(name)` is not a constructor. When a channel with that topic
// is already in the client's registry it hands back *that* one — and adding a
// `postgres_changes` or `presence` listener to a channel that has already
// subscribed throws, fatally:
//
//   cannot add `postgres_changes` callbacks for realtime:dm:<me>:<them> after `subscribe()`
//
// So any two components that open a channel under the same name at the same
// time are one render error waiting for a user to find it. This app has found
// it three times: presence across Friends/Inbox/DM (usePresence), the Inbox
// badge rendered twice by `tabBarIcon` (useUnreadDms), and a conversation
// reached while the same one was still on the stack below it — tap Message on
// the profile of the person whose DM you are already in and the thread you land
// on renders an error instead of the messages.
//
// The two cases are not the same problem, and only one of them is fixed here:
//
//   • **presence and broadcast** are a rendezvous. The topic *is* the address
//     every peer agrees on, so it cannot be made unique — those have to share
//     one channel and refcount it. That is what usePresence does.
//   • **postgres_changes** has no rendezvous. The subscription is described
//     entirely by the bindings (schema, table, event, filter); the topic is a
//     local name for the socket's channel and nothing outside this client reads
//     it. Two subscribers wanting the same rows want two channels, not one
//     shared one.
//
// `freshChannel` is for the second case: it suffixes the name so the registry
// can never hand you somebody else's channel. Cheap — channels are multiplexed
// over the one socket.
//
// Pair it with `supabase.removeChannel(channel)` on teardown, never with
// `channel.unsubscribe()` alone: unsubscribe leaves the channel in the registry,
// where it accumulates. Only removeChannel drops it.

let seq = 0;

/**
 * A `postgres_changes` channel this subscriber owns outright.
 *
 * Not for `presence` or `broadcast` — those need every peer on the same topic,
 * which is exactly what this breaks.
 */
export function freshChannel(name: string): RealtimeChannel {
  seq += 1;
  return supabase.channel(`${name}#${seq}`);
}
