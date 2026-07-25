import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchUsers } from '@/services/friends.service';
import { getProfilesByUsernames } from '@/services/community/mentions.service';
import { extractMentionUsernames } from '@/components/community/commentMentions';
import { useAuthStore } from '@/stores/authStore';
import { PostComment } from '@/types/models';
import { Mentionable } from '@/components/chat/MentionAutocomplete';

const DEBOUNCE_MS = 150;

// Live people-search for the composer's @-autocomplete. `query` is the active
// mention token (null when the user isn't mid-@). Debounced, hides self/blocked
// (searchUsers does), maps to the Mentionable shape the strip renders. A bare
// "@" (query "") lists people so the strip is never empty just for lack of typing.
export function useMentionSearch(query: string | null): Mentionable[] {
  const meId = useAuthStore((s) => s.user?.id);
  const [debounced, setDebounced] = useState<string | null>(query);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const q = useQuery({
    queryKey: ['mentionSearch', debounced, meId],
    queryFn: () => searchUsers(debounced ?? '', meId),
    enabled: debounced !== null,
    staleTime: 30_000,
  });

  return useMemo(
    () =>
      (q.data ?? [])
        .filter((p) => p.username)
        .map((p) => ({
          id: p.id,
          username: p.username!,
          name: p.name,
          photo_url: p.photo_url,
        })),
    [q.data]
  );
}

// The lowercase-username → id map that decides which @handles in the rendered
// thread are tappable. Resolves every handle actually present in the loaded
// comments (one keyed query), plus the viewer (so your own @handle highlights).
// Robust across sheet reopens — unlike a per-session "people I picked" cache.
export function useThreadMentionables(
  comments: PostComment[] | undefined
): Map<string, string> {
  const meId = useAuthStore((s) => s.user?.id);
  const meUsername = useAuthStore((s) => s.user?.username);
  const usernames = useMemo(() => extractMentionUsernames(comments), [comments]);

  const q = useQuery({
    queryKey: ['threadMentionables', usernames],
    queryFn: () => getProfilesByUsernames(usernames),
    enabled: usernames.length > 0,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const map = new Map<string, string>();
    if (meUsername && meId) map.set(meUsername.toLowerCase(), meId);
    for (const p of q.data ?? []) {
      if (p.username) map.set(p.username.toLowerCase(), p.id);
    }
    return map;
  }, [q.data, meUsername, meId]);
}
