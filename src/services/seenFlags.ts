import * as SecureStore from 'expo-secure-store';

// ─── SEEN-FLAG STORE ─────────────────────────────────────────────────────────
//
// "Has this user been shown X before?", on-device and namespaced per user so
// switching accounts on one phone starts over.
//
// Lifted out of `safety.ts`, which owned the only copy and still owns the
// safety popups' rules. A one-time tutorial is the same question with a
// different scope, and a second implementation of a SecureStore key format is
// the kind of duplication that drifts — one side gets a try/catch, the other
// does not.
//
// The key format is unchanged (`<scope>.<userId>.<flag>`), because changing it
// would make every safety flag already on a device unreadable and re-show every
// popup the user has dismissed.

// SecureStore keys may only contain [A-Za-z0-9._-]; user/event ids are UUIDs so
// they pass through unchanged.
function flagKey(scope: string, userId: string, flag: string): string {
  return `${scope}.${userId}.${flag}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

export async function hasSeenFlag(
  scope: string,
  userId: string,
  flag: string
): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(flagKey(scope, userId, flag))) != null;
  } catch {
    // Fail open: a storage error should never block the user, just re-show.
    return false;
  }
}

export async function markFlagSeen(
  scope: string,
  userId: string,
  flag: string
): Promise<void> {
  try {
    await SecureStore.setItemAsync(flagKey(scope, userId, flag), '1');
  } catch {
    // Non-fatal — worst case it shows again next time.
  }
}
