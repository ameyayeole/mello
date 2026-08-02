import * as SecureStore from 'expo-secure-store';
import {
  DRAFT_VERSION,
  StoredEventDraft,
  draftHasWork,
  parseDraft,
} from '@/utils/eventDraft';

// ─── EVENT DRAFT STORE ───────────────────────────────────────────────────────
// One in-progress event per user, kept on-device so the five-step wizard can be
// left and come back to. Same shape as the safety seen-flag store: SecureStore,
// namespaced per user so switching accounts on one phone does not hand someone
// else's half-written event to the next person, and fail-open everywhere —
// losing a draft is a disappointment, but throwing on the way into the create
// flow would stop them hosting at all.
//
// SecureStore documents a 2048-byte ceiling per value. The field limits cap a
// realistic draft near 1.2 KB (60-char title + 500-char description + a file
// URI + coordinates), so this fits, but a write that does exceed it fails the
// same way as any other storage error: quietly, leaving the user typing.

// SecureStore keys may only contain [A-Za-z0-9._-]; user ids are UUIDs so they
// pass through unchanged.
function draftKey(userId: string): string {
  return `eventDraft.${userId}`.replace(/[^A-Za-z0-9._-]/g, '_');
}

// What the flow hands over — everything the user chose, with the derived values
// (end time, clamped party size) left to be recomputed on restore.
export type DraftInput = Omit<StoredEventDraft, 'version' | 'savedAt'>;

// Saving a draft that holds nothing but defaults would resurrect an empty form
// and announce it as restored work, so that case clears instead.
export async function saveEventDraft(
  userId: string,
  draft: DraftInput
): Promise<void> {
  if (!draftHasWork(draft)) {
    await clearEventDraft(userId);
    return;
  }
  try {
    const payload: StoredEventDraft = {
      ...draft,
      version: DRAFT_VERSION,
      savedAt: Date.now(),
    };
    await SecureStore.setItemAsync(draftKey(userId), JSON.stringify(payload));
  } catch {
    // Non-fatal — the draft just is not there next time.
  }
}

// Returns null for absent, corrupt, stale, or wrong-version drafts; parseDraft
// owns those rules and is tested against them directly.
export async function loadEventDraft(
  userId: string
): Promise<StoredEventDraft | null> {
  try {
    return parseDraft(await SecureStore.getItemAsync(draftKey(userId)));
  } catch {
    return null;
  }
}

export async function clearEventDraft(userId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(draftKey(userId));
  } catch {
    // Non-fatal — a stale draft expires on its own.
  }
}
