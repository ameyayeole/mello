import * as SecureStore from 'expo-secure-store';
import { hasSeenFlag, markFlagSeen } from './seenFlags';

// ─── SEEN FLAGS ──────────────────────────────────────────────────────────────
// Which safety popups this user has already seen, per the frequency rules in
// the safety spec: "once ever" (plain flag), "once per event/host" (flag keyed
// by the entity id).
//
// The store itself is `seenFlags.ts` — the same question is now asked by the
// swipe deck's one-time tutorial, under its own scope. These two keep the
// `safety` scope, which is the key format already on every device.

export const hasSeenSafetyFlag = (userId: string, flag: string) =>
  hasSeenFlag('safety', userId, flag);

export const markSafetyFlagSeen = (userId: string, flag: string) =>
  markFlagSeen('safety', userId, flag);

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

// The money guard stores a *date* rather than a bare "seen", so it keeps its own
// key — but in the same `safety` scope and the same shape as the flags above.
function moneyGuardKey(userId: string, conversationId: string): string {
  return `safety.${userId}.moneyguard.${conversationId}`.replace(
    /[^A-Za-z0-9._-]/g,
    '_'
  );
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
