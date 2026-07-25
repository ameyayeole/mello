// Pull the unique @handles out of a set of comment bodies so the thread can
// resolve them to profile ids (→ which handles render tappable). Lowercased and
// sorted so the resulting query key is stable regardless of encounter order.
// Same token grammar as chat's MentionText / the server-side resolver.
const MENTION_RE = /@([a-zA-Z0-9._]+)/g;

export function extractMentionUsernames(
  comments: { body: string | null }[] | undefined
): string[] {
  const set = new Set<string>();
  for (const c of comments ?? []) {
    if (!c.body) continue;
    MENTION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MENTION_RE.exec(c.body))) set.add(m[1].toLowerCase());
  }
  return [...set].sort();
}
