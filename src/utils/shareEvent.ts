import { Share } from 'react-native';
import * as Linking from 'expo-linking';
import { formatEventTime } from './time';

// "Share this event": one tap invites a friend via the native share sheet
// (WhatsApp/SMS/etc). The message carries a deep link that opens the app
// straight to this event — see useDeepLinks for the incoming side.
export async function shareEvent(event: {
  id: string;
  title: string;
  location_name?: string | null;
  starts_at: string;
}): Promise<void> {
  // Builds mello://event/<id> in standalone builds (exp://…/event/<id> in
  // dev). useDeepLinks keys off the "event" host + path, so both resolve.
  const url = Linking.createURL(`event/${event.id}`);

  const lines = [
    `Join me at "${event.title}" on Mello!`,
    `When: ${formatEventTime(event.starts_at)}`,
    event.location_name ? `Where: ${event.location_name}` : null,
    '',
    `👉 ${url}`,
  ].filter((line) => line !== null);

  try {
    await Share.share({ message: lines.join('\n') });
  } catch {
    // User dismissed the share sheet — nothing to do.
  }
}
