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

// Only the first two steps gate progress: an event needs an activity and a
// title. Everything after has a usable default.
export function canAdvanceFrom(
  step: number,
  draft: { activity: string | null; title: string }
): boolean {
  if (step === 0) return draft.activity !== null;
  if (step === 1) return draft.title.trim().length > 0;
  return true;
}

export function eventEndTime(start: Date, durationHours: number): Date {
  return new Date(start.getTime() + durationHours * 60 * 60 * 1000);
}

// Where the map opens when the user's location is unavailable — permission
// denied, or the fix hasn't arrived yet. Mumbai, the launch city. Previously
// hardcoded in both the map tab and the edit screen, so moving the launch city
// meant remembering to change two unrelated files.
export const FALLBACK_MAP_CENTER = { lat: 19.076, lng: 72.8777 };
