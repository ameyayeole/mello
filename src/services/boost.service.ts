import { supabase } from './supabase';

// Boost credits: bought in packs (see iap.ts / verify-boost), spent one at a
// time on the host's own events via the use_boost RPC (migration 028).

export async function getBoostCredits(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('profiles')
    .select('boost_credits')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return (data as any)?.boost_credits ?? 0;
}

// Spends 1 credit on the event; the server enforces host-only / has-credits /
// not-already-boosted and returns the new boosted_until.
export async function spendBoost(eventId: string): Promise<string> {
  const { data, error } = await supabase.rpc('use_boost', {
    p_event_id: eventId,
  });
  if (error) {
    // Surface the RPC's structured reasons as readable messages.
    if (error.message?.includes('no_credits')) {
      throw new Error('You have no boosts left.');
    }
    if (error.message?.includes('not_boostable')) {
      throw new Error('This event cannot be boosted right now.');
    }
    throw error;
  }
  return data as string;
}
