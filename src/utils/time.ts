import { formatDistanceToNow, format, isToday, isTomorrow } from 'date-fns';

export function relativeTime(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), { addSuffix: true });
}

const EVENING_HOUR = 17;

// The near-term day label, or null once the event is far enough out that the
// caller should fall back to its own longer format — cards and the detail sheet
// legitimately differ there (one line vs two), and only these labels need to
// agree.
//
// They did not agree before: the sheet carried a private copy of this that knew
// about "Tonight" and `formatEventTime` did not, so the same 7 PM event read
// "Today 7:00 PM" on a card and "Tonight" in the sheet.
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

// The two-line form used by the event detail sheet: a friendly day label over a
// short time ("Tonight" / "8:30 PM").
export function splitEventTime(dateString: string): {
  dateShort: string;
  timeShort: string;
} {
  const date = new Date(dateString);
  return {
    dateShort: nearDayLabel(date) ?? format(date, 'EEE, d MMM'),
    timeShort: format(date, 'h:mm a'),
  };
}

export function formatChatTime(dateString: string): string {
  return format(new Date(dateString), 'h:mm a');
}
