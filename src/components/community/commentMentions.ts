import { Profile, PostComment } from '@/types/models';

// Builds the lowercase-username → user-id map that MentionText uses to decide
// which @handles in a comment body are tappable. The pool is everyone we can
// name: the viewer's friends, the authors already in this thread, and the
// viewer themselves (so your own @handle renders highlighted too). Entries
// without a username are skipped. Later sources win on a key collision, but the
// id is the same person either way.
export function buildMentionables(
  friends: Profile[],
  comments: PostComment[] | undefined,
  self?: Pick<Profile, 'id' | 'username'> | null
): Map<string, string> {
  const map = new Map<string, string>();
  const add = (username: string | undefined | null, id: string) => {
    if (username) map.set(username.toLowerCase(), id);
  };
  for (const f of friends) add(f.username, f.id);
  for (const c of comments ?? []) add(c.author_username, c.author_id);
  if (self) add(self.username, self.id);
  return map;
}
