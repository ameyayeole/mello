import { formatDistanceToNow, format, isToday, isTomorrow } from 'date-fns';

export function relativeTime(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), { addSuffix: true });
}

export function formatEventTime(dateString: string): string {
  const date = new Date(dateString);
  if (isToday(date)) return `Today ${format(date, 'h:mm a')}`;
  if (isTomorrow(date)) return `Tomorrow ${format(date, 'h:mm a')}`;
  return format(date, 'MMM d, h:mm a');
}

export function formatChatTime(dateString: string): string {
  return format(new Date(dateString), 'h:mm a');
}
