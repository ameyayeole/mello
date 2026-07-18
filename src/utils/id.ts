// Pure-JS UUID v4. Used to mint a row id on the client *before* it round-trips
// to Supabase, so an optimistic row can be reconciled with its realtime echo by
// matching ids. Not cryptographically strong — it only needs to be unique, and
// v4 randomness is more than enough for that. Kept dependency-free on purpose so
// it works without the expo-crypto native module being in the binary.
export function newId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
