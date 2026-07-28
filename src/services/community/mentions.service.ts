import { supabase } from '@/services/supabase';
import { prefixIlikePattern } from '@/utils/postgrest';
import { Profile } from '@/types/models';

// Order typeahead results so the most obvious pick is first: handles whose
// USERNAME starts with the query beat name-only matches, then alphabetical by
// username. Pure so it can be unit-tested without a network round-trip.
export function rankMentionables(people: Profile[], query: string): Profile[] {
  const q = query.replace(/^@/, '').trim().toLowerCase();
  const usernameScore = (p: Profile) =>
    q && (p.username ?? '').toLowerCase().startsWith(q) ? 0 : 1;
  return [...people].sort((a, b) => {
    const s = usernameScore(a) - usernameScore(b);
    if (s !== 0) return s;
    return (a.username ?? '').toLowerCase().localeCompare(
      (b.username ?? '').toLowerCase()
    );
  });
}

// Typeahead for @mention: profiles whose username OR name STARTS WITH the query
// (a substring match on a single letter is unusably noisy), self/blocked hidden,
// ranked. An empty query (bare "@") lists people so the strip isn't blank. Only
// profiles that actually have a username are returned — you can't @ someone
// without a handle.
export async function searchMentionables(
  query: string,
  currentUserId?: string
): Promise<Profile[]> {
  const q = query.replace(/^@/, '').trim();
  let builder = supabase.from('profiles').select('*').not('username', 'is', null);
  if (q.length > 0) {
    const p = prefixIlikePattern(q);
    builder = builder.or(`username.ilike.${p},name.ilike.${p}`);
  }
  const { data, error } = await builder.limit(20);
  if (error) throw error;
  let results = (data ?? []) as Profile[];

  if (currentUserId) {
    const { data: blocks } = await supabase
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', currentUserId);
    const blocked = new Set((blocks ?? []).map((b: any) => b.blocked_id));
    results = results.filter((p) => p.id !== currentUserId && !blocked.has(p.id));
  }
  return rankMentionables(results, q);
}

// Resolve a set of @handles (already lowercased) to the profiles that own them.
// Usernames are stored lowercase (migration 029's CHECK), so an equality `in`
// filter is exact. Used to build the tappable-mention map for a comment thread.
export async function getProfilesByUsernames(
  usernames: string[]
): Promise<{ id: string; username: string }[]> {
  if (usernames.length === 0) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .in('username', usernames);
  if (error) throw error;
  return (data ?? []) as { id: string; username: string }[];
}
