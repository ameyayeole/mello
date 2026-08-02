import { fmtTime } from '@/utils/time';

// When an event can start and how long it runs — the option lists the create
// flow's date, time and duration wheels are built from.
//
// Kept apart from the flow for the same reason `eventDraft` is: these are
// answerable without a map, an animation or a renderer, and while they lived
// inside a 2,300-line component they had no tests at all.

// How far ahead an event can be scheduled. Long enough for a season, short
// enough that the date wheel stays a wheel rather than a calendar.
export const DATE_WINDOW_DAYS = 90;
export const TIME_STEP_MIN = 30;

export type WheelOption<T> = { value: T; label: string };

// The one day label. Used by the wheel and by the row that opens it, so the row
// cannot describe the date differently from the list it came from — which it
// did: the row showed "28 Aug" while the wheel showed "Fri, 28 Aug".
export function dayLabel(d: Date, today: Date): string {
  const days = Math.round(
    (new Date(d).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) /
      86_400_000
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// Built from `now` rather than at module load, so a session left open overnight
// does not go on offering yesterday.
export function dayOptions(now: Date): WheelOption<number>[] {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return Array.from({ length: DATE_WINDOW_DAYS }, (_, i) => {
    const d = new Date(midnight);
    d.setDate(d.getDate() + i);
    return { value: d.getTime(), label: dayLabel(d, midnight) };
  });
}

// Every slot in a day, as minutes past midnight.
export function timeOptions(): WheelOption<number>[] {
  const perDay = (24 * 60) / TIME_STEP_MIN;
  return Array.from({ length: perDay }, (_, i) => {
    const mins = i * TIME_STEP_MIN;
    const d = new Date();
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return { value: mins, label: fmtTime(d) };
  });
}

// The wheel addresses day and minute-of-day separately; these read those two
// coordinates back out of the single Date that stays the source of truth.
export function dayValueOf(d: Date): number {
  return new Date(d).setHours(0, 0, 0, 0);
}

export function minuteValueOf(d: Date): number {
  return (
    d.getHours() * 60 +
    Math.round(d.getMinutes() / TIME_STEP_MIN) * TIME_STEP_MIN
  );
}
