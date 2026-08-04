import { useUIStore } from '@/stores/uiStore';

// Custom deep links point at an event (mello://event/<id>), but events have no
// file route — they open as a dealt card. expo-router calls this before it
// tries to match a route (for both the cold-start URL and warm links), so we
// pull the id out, stash it, and send the user to the map tab. The app-wide
// EventDealtCard in (tabs)/_layout watches uiStore.dealtCard and opens itself —
// the same path a tapped notification uses (openNotificationTarget).
//
// A single-entry deck, and a null origin: nothing was on screen to fly from —
// the app may not even have been open yet.
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    const post = path.match(/(?:^|\/)post\/([^/?#]+)/);
    if (post?.[1]) {
      // The post detail screen (Phase 7) has a real file route.
      return `/post/${decodeURIComponent(post[1])}`;
    }

    const match = path.match(/(?:^|\/)event\/([^/?#]+)/);
    if (match?.[1]) {
      const eventId = decodeURIComponent(match[1]);
      useUIStore.getState().dealCard(eventId, null);
      return '/(tabs)/map';
    }
  } catch {
    // Malformed link — fall through to normal routing (likely +not-found).
  }
  return path;
}
