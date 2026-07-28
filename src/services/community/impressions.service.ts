import { supabase } from '@/services/supabase';

/**
 * Record that the viewer has seen these posts. The v2 feed ranker filters out
 * anything seen three times (migration 066).
 *
 * Deliberately swallows every failure. This is fire-and-forget telemetry
 * flushed on a timer from a scroll handler: there is no UI waiting on it, and
 * letting it reject would surface a network blip as a feed error — or worse, an
 * unhandled rejection from the interval that fires it.
 *
 * The RPC reads auth.uid() for the viewer, so no user id is passed.
 */
export async function recordImpressions(postIds: string[]): Promise<void> {
  if (postIds.length === 0) return;
  try {
    await supabase.rpc('record_impressions', { p_post_ids: postIds });
  } catch {
    // Intentionally ignored — see above.
  }
}
