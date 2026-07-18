import { supabase } from './supabase';

// Instagram-style handle rules: a-z, 0-9, '.' and '_', 3-30 chars, no leading/
// trailing dot, no consecutive dots. Mirrors the CHECK in migration 029.
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

// Lowercases and strips anything a username can never contain, while the user
// types. Doesn't enforce length/dot-position rules — that's validateUsername.
export function normalizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, USERNAME_MAX);
}

// Returns an error message, or null when the format is valid.
export function validateUsername(username: string): string | null {
  if (username.length < USERNAME_MIN)
    return `Usernames need at least ${USERNAME_MIN} characters.`;
  if (username.length > USERNAME_MAX)
    return `Usernames can't be longer than ${USERNAME_MAX} characters.`;
  if (!/^[a-z0-9._]+$/.test(username))
    return 'Only letters, numbers, dots and underscores.';
  if (username.startsWith('.') || username.endsWith('.'))
    return "Usernames can't start or end with a dot.";
  if (username.includes('..')) return "Usernames can't have two dots in a row.";
  return null;
}

export async function checkUsernameAvailable(
  username: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', {
    candidate: username,
  });
  if (error) throw error;
  return data === true;
}

// Instagram-style suggestions when the wanted handle is taken: variants of the
// name/handle with separators and digits, batch-checked in one query.
export async function suggestUsernames(
  name: string,
  taken?: string
): Promise<string[]> {
  let base = normalizeUsername(name.replace(/\s+/g, '_'));
  base = base.replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '');
  if (base.length < USERNAME_MIN) base = taken && taken.length >= USERNAME_MIN ? taken : 'mello';
  base = base.slice(0, USERNAME_MAX - 5);

  const digits = () => String(Math.floor(Math.random() * 900 + 100));
  const candidates = Array.from(
    new Set(
      [
        `${base}_`,
        `${base}${digits()}`,
        `${base}.${digits().slice(0, 2)}`,
        `${base}_${digits().slice(0, 2)}`,
        `its.${base}`.slice(0, USERNAME_MAX),
        `${base}${digits()}`,
      ].filter((c) => !validateUsername(c) && c !== taken)
    )
  );

  const { data, error } = await supabase
    .from('profiles')
    .select('username')
    .in('username', candidates);
  if (error) throw error;

  const used = new Set((data ?? []).map((r: any) => r.username));
  return candidates.filter((c) => !used.has(c)).slice(0, 3);
}
