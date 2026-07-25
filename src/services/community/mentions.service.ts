import { supabase } from '@/services/supabase';

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
