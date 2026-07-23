import { useUIStore } from '@/stores/uiStore';

// Custom deep links point at an event (mello://event/<id>), but events have no
// file route — they open in a bottom sheet. expo-router calls this before it
// tries to match a route (for both the cold-start URL and warm links), so we
// pull the id out, stash it, and send the user to the map tab. The app-wide
// sheet in (tabs)/_layout watches selectedEventId and opens itself — the same
// path a tapped notification uses (openNotificationTarget).
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    const match = path.match(/(?:^|\/)event\/([^/?#]+)/);
    if (match?.[1]) {
      useUIStore.getState().setSelectedEvent(decodeURIComponent(match[1]));
      return '/(tabs)/map';
    }
  } catch {
    // Malformed link — fall through to normal routing (likely +not-found).
  }
  return path;
}
