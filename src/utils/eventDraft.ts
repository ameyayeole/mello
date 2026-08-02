// The rules a new event has to satisfy, kept apart from the create flow so they
// can be stated — and tested — without a map, an animation or a renderer.
//
// These limits previously existed in two places that disagreed: the create flow
// enforced them inline, while a dead validation module declared a title max of
// 80 and a party size max of 20. Neither matched what actually shipped. The
// duplicate is gone; this is the only copy.

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 500;

export const MIN_PEOPLE = 2;
export const MAX_PEOPLE = 50;
export const DEFAULT_PEOPLE = 4;

// The party-size field is free text, so it has to survive anything typed into
// it — empty, "abc", "0", "999", "12 people". parseInt handles the trailing
// junk, and the clamp handles the rest.
export function clampMaxPeople(input: string): number {
  const parsed = parseInt(input, 10);
  if (Number.isNaN(parsed)) return DEFAULT_PEOPLE;
  return Math.min(MAX_PEOPLE, Math.max(MIN_PEOPLE, parsed));
}

export const STEP_COUNT = 5;

// DateTimeField floors the *date* picker at today but the time grid renders all
// 48 slots unconditionally, so today + an earlier slot produces an event that
// already ended. Nothing downstream catches it: createEvent inserts what it is
// given, and a CHECK constraint cannot help because Postgres requires CHECK
// expressions to be IMMUTABLE and now() is only STABLE. Enforcing it in the
// database would take a BEFORE INSERT trigger; this is the guard that ships.
export function isStartInPast(start: Date, now: Date = new Date()): boolean {
  return start.getTime() < now.getTime();
}

// The first two steps gate on a required field; the "when" step gates on the
// start being in the future. Everything else has a usable default.
//
// `startDate` is optional so a caller that has not reached the when-step yet —
// and the existing tests — can ask about the earlier steps without inventing a
// date. Absent means "nothing to check", not "invalid".
export function canAdvanceFrom(
  step: number,
  draft: { activity: string | null; title: string; startDate?: Date },
  now: Date = new Date()
): boolean {
  if (step === 0) return draft.activity !== null;
  if (step === 1) return draft.title.trim().length > 0;
  if (step === 2 && draft.startDate) return !isStartInPast(draft.startDate, now);
  return true;
}

export function eventEndTime(start: Date, durationHours: number): Date {
  return new Date(start.getTime() + durationHours * 60 * 60 * 1000);
}

// ─── Draft persistence ───────────────────────────────────────────────────────
// The wizard is five steps deep and used to lose everything the moment it
// closed. What gets stored is only what the user chose; the derived values
// (end time, clamped party size) are recomputed on restore so a stored draft
// can never disagree with the rules above.

// Bump when the shape changes. A draft written by an older build is dropped
// rather than migrated — it is one form's worth of typing, not data worth a
// migration path, and guessing at a missing field is how you restore nonsense.
export const DRAFT_VERSION = 1;

// Drafts are a convenience for "I got interrupted", not an archive. A week is
// long enough to cover a weekend, short enough that a forgotten draft does not
// ambush someone a month later.
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredEventDraft {
  version: number;
  savedAt: number;
  step: number;
  coord: { lat: number; lng: number } | null;
  locationName: string;
  activity: string | null;
  title: string;
  description: string;
  photoUri: string | null;
  // Epoch ms, not a Date: this round-trips through JSON.
  startsAt: number;
  durationH: number;
  maxPeople: string;
  isPublic: boolean;
  requiresApproval: boolean;
  womenOnly: boolean;
}

// Did the user actually put anything in? The date, duration and toggles all
// arrive pre-filled, so they cannot be evidence of work — only the fields
// someone had to choose or type count. Used both to decide whether a draft is
// worth storing and whether leaving needs to ask.
export function draftHasWork(
  d: Pick<StoredEventDraft, 'activity' | 'title' | 'description' | 'photoUri'>
): boolean {
  return (
    d.activity !== null ||
    d.title.trim().length > 0 ||
    d.description.trim().length > 0 ||
    d.photoUri !== null
  );
}

// Returns null for anything not worth restoring: absent, unparseable, written
// by a different version, or expired. Never throws — a corrupt draft must not
// be able to stop someone hosting.
export function parseDraft(
  raw: string | null | undefined,
  now: number = Date.now()
): StoredEventDraft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const d = parsed as Partial<StoredEventDraft>;

  if (d.version !== DRAFT_VERSION) return null;
  if (typeof d.savedAt !== 'number' || !Number.isFinite(d.savedAt)) return null;
  if (now - d.savedAt > DRAFT_TTL_MS) return null;
  // A clock that moved backwards would otherwise make a future draft immortal.
  if (d.savedAt > now + DRAFT_TTL_MS) return null;
  if (typeof d.startsAt !== 'number' || !Number.isFinite(d.startsAt)) return null;
  if (typeof d.title !== 'string' || typeof d.description !== 'string') {
    return null;
  }

  const restored: StoredEventDraft = {
    version: DRAFT_VERSION,
    savedAt: d.savedAt,
    // Clamp rather than reject: a step outside the wizard is recoverable by
    // putting the user back at the start, losing nothing they typed.
    step: clampStep(d.step),
    coord:
      d.coord &&
      typeof d.coord.lat === 'number' &&
      typeof d.coord.lng === 'number'
        ? { lat: d.coord.lat, lng: d.coord.lng }
        : null,
    locationName: typeof d.locationName === 'string' ? d.locationName : '',
    activity: typeof d.activity === 'string' ? d.activity : null,
    title: d.title.slice(0, TITLE_MAX),
    description: d.description.slice(0, DESCRIPTION_MAX),
    photoUri: typeof d.photoUri === 'string' ? d.photoUri : null,
    startsAt: d.startsAt,
    durationH: typeof d.durationH === 'number' && d.durationH > 0 ? d.durationH : 2,
    maxPeople: String(clampMaxPeople(String(d.maxPeople ?? ''))),
    isPublic: d.isPublic !== false,
    requiresApproval: d.requiresApproval === true,
    womenOnly: d.womenOnly === true,
  };

  // A draft holding nothing but defaults is not worth restoring — it would
  // announce "draft restored" for an empty form.
  return draftHasWork(restored) ? restored : null;
}

function clampStep(step: unknown): number {
  if (typeof step !== 'number' || !Number.isFinite(step)) return 0;
  return Math.min(STEP_COUNT - 1, Math.max(0, Math.floor(step)));
}

// Where the map opens when the user's location is unavailable — permission
// denied, or the fix hasn't arrived yet. Mumbai, the launch city. Previously
// hardcoded in both the map tab and the edit screen, so moving the launch city
// meant remembering to change two unrelated files.
export const FALLBACK_MAP_CENTER = { lat: 19.076, lng: 72.8777 };
