import * as SecureStore from 'expo-secure-store';

// ─── SEEN-FLAG STORE ─────────────────────────────────────────────────────────
// Tracks which safety popups a user has already seen, per the frequency rules
// in the safety spec: "once ever" (plain flag), "once per event/host" (flag
// keyed by the entity id). Stored on-device in SecureStore, namespaced per
// user so switching accounts on one phone re-shows the popups.

// SecureStore keys may only contain [A-Za-z0-9._-]; user/event ids are UUIDs
// so they pass through unchanged.
function flagKey(userId: string, flag: string): string {
  return `safety.${userId}.${flag}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

export async function hasSeenSafetyFlag(
  userId: string,
  flag: string
): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(flagKey(userId, flag))) != null;
  } catch {
    // Fail open: a storage error should never block the user, just re-show.
    return false;
  }
}

export async function markSafetyFlagSeen(
  userId: string,
  flag: string
): Promise<void> {
  try {
    await SecureStore.setItemAsync(flagKey(userId, flag), '1');
  } catch {
    // Non-fatal — worst case the popup shows again next time.
  }
}

// A host is considered "new" (popup #5) if their profile is younger than this.
export const NEW_HOST_DAYS = 14;

export function isNewHost(hostCreatedAt: string | undefined | null): boolean {
  if (!hostCreatedAt) return false;
  const ageMs = Date.now() - new Date(hostCreatedAt).getTime();
  return ageMs < NEW_HOST_DAYS * 24 * 60 * 60 * 1000;
}

// Categories where the alcohol/party heads-up (#8) applies.
export function isPartyActivity(activity: string): boolean {
  return activity === 'parties' || activity === 'drinks';
}

// ─── MONEY-REQUEST GUARD (#11) ───────────────────────────────────────────────
// Client-side detection of payment-related terms in chat, shown to the
// *recipient*, rate-limited to once per conversation per day.

const MONEY_PATTERN = new RegExp(
  [
    '₹',
    '\\brs\\.?\\s?\\d',
    '\\brupees?\\b',
    '\\bpay\\b',
    '\\bpayment\\b',
    '\\bupi\\b',
    '\\bdeposit\\b',
    '\\badvance\\b',
    '\\bgpay\\b',
    '\\bgoogle\\s?pay\\b',
    '\\bphonepe\\b',
    '\\bpaytm\\b',
    '\\baccount\\s?(no|number)\\b',
    '\\bifsc\\b',
  ].join('|'),
  'i'
);

export function looksLikeMoneyRequest(text: string): boolean {
  return MONEY_PATTERN.test(text);
}

function moneyGuardKey(userId: string, conversationId: string): string {
  return flagKey(userId, `moneyguard.${conversationId}`);
}

// True if the banner may be shown for this conversation (not yet shown today).
export async function canShowMoneyGuard(
  userId: string,
  conversationId: string
): Promise<boolean> {
  try {
    const last = await SecureStore.getItemAsync(
      moneyGuardKey(userId, conversationId)
    );
    return last !== new Date().toDateString();
  } catch {
    return true;
  }
}

export async function markMoneyGuardShown(
  userId: string,
  conversationId: string
): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      moneyGuardKey(userId, conversationId),
      new Date().toDateString()
    );
  } catch {
    // Non-fatal.
  }
}
