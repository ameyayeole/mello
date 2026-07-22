import {
  formatDistanceToNow,
  format,
  isToday,
  isTomorrow,
  differenceInCalendarDays,
} from 'date-fns';

// "2 hours ago" / "in 3 days". For things that genuinely happened at a point in
// the past — when an event was posted, when a notification arrived. Event
// *start* times do not use this: see the ladder below.
export function relativeTime(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), { addSuffix: true });
}

// The dense counterpart to relativeTime: "2m ago", "38m ago", "5h ago",
// "3d ago". For a list where every row carries a timestamp and date-fns's
// "about 2 hours ago" would be the widest thing on the row.
//
// It stops counting at a month. "6w ago" is a number you have to convert before
// it means anything, and by then a date is what you actually wanted.
export function shortRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  // Clamp at zero: clock skew between the phone and the database can date a
  // row a second or two into the future, and "-1m ago" is worse than "Just now".
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return format(date, 'MMM d');
}

const COMPLETED = 'Completed';

// Weekday names stop being unambiguous the moment "Saturday" could mean either
// of two Saturdays, so a week out is where they give way to a date.
const WEEKDAY_HORIZON_DAYS = 7;

/**
 * The one ladder every event date in the app climbs:
 *
 *   past → Completed · today → Today · tomorrow → Tomorrow ·
 *   inside a week → the weekday · beyond that → the date
 *
 * A finished event reads "Completed", never "22 hours ago" — once it is over,
 * how long ago it started is not what you want to know.
 */
export function eventDayLabel(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  if (date.getTime() <= now.getTime()) return COMPLETED;
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (differenceInCalendarDays(date, now) < WEEKDAY_HORIZON_DAYS) {
    return format(date, 'EEEE');
  }
  return format(date, 'EEE, MMM d');
}

/**
 * The standalone "when" badge — a pill carrying the date on its own, with no
 * clock time beside it. Same ladder as `eventDayLabel`, except today collapses
 * to a live countdown, which is the whole reason a card wears a badge at all:
 *
 *   Completed · in 40 min · in 3 hours · Tomorrow · Saturday · Jul 20
 */
export function relativeWhen(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const ms = date.getTime() - now.getTime();
  if (ms <= 0) return COMPLETED;

  if (isToday(date)) {
    const mins = Math.round(ms / 60_000);
    if (mins < 60) return `in ${mins} min`;
    const hours = Math.round(ms / 3_600_000);
    return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  if (isTomorrow(date)) return 'Tomorrow';
  if (differenceInCalendarDays(date, now) < WEEKDAY_HORIZON_DAYS) {
    return format(date, 'EEEE');
  }
  // No weekday here: the badge is the narrowest thing on a card.
  return format(date, 'MMM d');
}

/**
 * "Today · 3:30 PM" / "Sat, Jul 20 · 3:30 PM" — the day-and-time that every
 * event card, row and sheet leads with. Callers append their own trailing fact
 * with the same separator, so the whole line reads as one system:
 *
 *   `${formatEventWhen(e.starts_at)} · ${e.location_name}`
 *   `${formatEventWhen(e.starts_at)} · ${count} going`
 *
 * A completed event is just "Completed" — the clock time it started at is noise
 * once it is over.
 */
export function formatEventWhen(dateString: string): string {
  const day = eventDayLabel(dateString);
  if (day === COMPLETED) return day;
  return `${day} · ${format(new Date(dateString), 'h:mm a')}`;
}

const EVENING_HOUR = 17;

// "Tonight 7:00 PM" / "Jul 27, 7:00 PM". NOT for event start times — those all
// go through the ladder above. What is left here is the handful of places that
// stamp a plain moment: the check-in receipt, and the share message, where a
// relative label would be a lie by the time the recipient reads it.
function nearDayLabel(date: Date): string | null {
  if (isToday(date)) return date.getHours() >= EVENING_HOUR ? 'Tonight' : 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return null;
}

export function formatEventTime(dateString: string): string {
  const date = new Date(dateString);
  const day = nearDayLabel(date);
  return day
    ? `${day} ${format(date, 'h:mm a')}`
    : format(date, 'MMM d, h:mm a');
}

// The two-line form used by the event detail sheet: the same day label every
// other surface shows, stacked over the clock time.
export function splitEventTime(dateString: string): {
  dateShort: string;
  timeShort: string;
} {
  return {
    dateShort: eventDayLabel(dateString),
    timeShort: format(new Date(dateString), 'h:mm a'),
  };
}

export function formatChatTime(dateString: string): string {
  return format(new Date(dateString), 'h:mm a');
}
