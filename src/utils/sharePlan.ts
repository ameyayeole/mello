import { Share } from 'react-native';
import { formatEventTime } from './time';

// "Share my plan": one tap sends a trusted contact the event name, place and
// start time via the native share sheet (WhatsApp/SMS/etc).
export async function sharePlan(event: {
  title: string;
  location_name?: string | null;
  starts_at: string;
}): Promise<void> {
  const lines = [
    `I'm going to "${event.title}" — a Mello meetup.`,
    event.location_name ? `Where: ${event.location_name}` : null,
    `When: ${formatEventTime(event.starts_at)}`,
    `Just so someone knows where I am 💛`,
  ].filter(Boolean);

  try {
    await Share.share({ message: lines.join('\n') });
  } catch {
    // User dismissed the share sheet — nothing to do.
  }
}
