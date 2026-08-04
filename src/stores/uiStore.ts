import { create } from 'zustand';
import * as Haptics from 'expo-haptics';
import { ActivityId } from '@/types/models';
import { CONFIG } from '@/constants/config';
import { DEFAULT_MAP_FILTERS, MapFilters } from '@/utils/mapFilters';

// Set when the user taps the pre-event safety reminder notification; the tabs
// layout shows safety sheet #4 ("Meeting in real life") for this event.
export interface SafetyReminderEvent {
  id: string;
  title: string;
  location_name?: string | null;
  starts_at: string;
}

// A notification to show as the Mello-styled in-app banner (set by
// useNotifications when a notification arrives while the app is open).
export interface InAppBanner {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

// One of the app's full-screen overlays, named by the element it takes over
// from. Adding one means adding it here and measuring its origin — see
// `Handoff` below.
//
// `chatSearch` lands on the same route as `search` but is its own key on
// purpose: the key is what tells a page which of *its* elements to hide while
// the flying copy is out, and home and the Inbox each have a search bar. One
// shared key would hide both.
export type OverlayKey =
  | 'notifications'
  | 'search'
  | 'chatSearch'
  | 'settings';

// Where the element a full-screen overlay is taking over sat, in window
// coordinates, at the moment it was tapped: home's notification chip, home's
// search bar. The overlay redraws that element at exactly this rect and flies
// it to where it belongs on the new screen, so the thing you pressed is the
// thing that becomes the way out of what you opened.
//
// Measured rather than derived. The rect depends on the safe-area inset and on
// the header row's height, which is set by the greeting's line count —
// recomputing that on the other screen would be the same layout written twice,
// and it would be wrong the first time either one changed.
//
// `key` is what tells the screen underneath *which* of its elements to hide
// while the flying copy is out; the others just recede with the page.
export interface Handoff {
  key: OverlayKey;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Where the element a dealt card came out of sat, in window coordinates, at
// the moment it was tapped: a map pin, a feed card, a rail item. The card is
// drawn at this rect and arcs to the centre of the screen, so the thing you
// pressed becomes the thing you are looking at.
//
// Same idea as `Handoff` above, and measured for the same reason: the rect
// depends on layout nobody should be re-deriving.
export interface DealtOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

// What a swipe on the dealt card should DO, not who opened it — the card
// itself has no idea which screen dealt it. Every opener except the swipe
// deck is 'browse': right saves to the wishlist, left just advances, no quota
// and no permanent pass. The swipe deck is the one place that contract is
// wrong — there, a swipe is the real thing, spending one of the day's free
// swipes and recording a permanent pass — so its dealt card carries
// 'swipeDeck' and EventDealtCard delegates to that screen's own swipe()
// instead of the generic handler.
//
// A discriminant, not a stored callback: a function in zustand state can't be
// serialised and silently goes stale the moment the component that created it
// unmounts. A string survives `advanceDealtCard` exactly like `ids` does.
export type DealtCardSource = 'browse' | 'swipeDeck';

// The open card and the deck behind it. `ids` is the whole deck; `index` is
// which one is face up.
//
// `origin` belongs to the FIRST card only and is dropped on the first advance:
// once you have swiped, nothing on screen is where the current card came from,
// and flying back to the original pin would claim you are looking at an event
// you are not.
//
// `source` survives every advance, unlike `origin` — which screen dealt the
// deck doesn't change as you move through it.
export interface DealtCardState {
  ids: string[];
  index: number;
  origin: DealtOrigin | null;
  source: DealtCardSource;
}

interface UIState {
  activeFilter: ActivityId | null;
  // Map-tab filters (activity chips + the filter sheet). Separate from
  // activeFilter, which belongs to the Explore feed's chips.
  mapFilters: MapFilters;
  // Radius for the nearby-events query. Currently fixed at the config default —
  // the map's own distance filter lives in mapFilters.maxDistanceM instead.
  searchRadius: number;
  ghostMode: boolean;
  // True while the in-map event creation flow is open; the tab bar hides so
  // the map + wizard own the whole screen.
  creatingEvent: boolean;
  safetyReminderEvent: SafetyReminderEvent | null;
  inAppBanner: InAppBanner | null;
  // Chat the user is currently viewing ("event:<id>" or "dm:<friendId>"), used
  // to suppress the in-app banner for messages in that same thread.
  activeChat: string | null;
  // Two flags, because a full-screen overlay stops asserting itself well before
  // it stops existing, and different things underneath key off those two
  // moments.
  //
  //   open     — set while the overlay holds the foreground. The page beneath
  //              recedes and the tab bar slides away. Cleared at the *start* of
  //              the exit, so both are back by the time the route pops.
  //   mounted  — set while the route exists at all. The handed-over element
  //              stays hidden underneath this whole time, because the overlay
  //              is drawing that same element itself and flying it across. Two
  //              copies of one object, one of them fading, is what a hand-off
  //              must never look like. Cleared on unmount, when the flying copy
  //              is gone and the original can take its position back.
  overlayOpen: boolean;
  overlayMounted: boolean;
  handoff: Handoff | null;
  dealtCard: DealtCardState | null;
  setInAppBanner: (banner: InAppBanner | null) => void;
  setActiveChat: (key: string | null) => void;
  setFilter: (activity: ActivityId | null) => void;
  setMapFilters: (filters: MapFilters) => void;
  resetMapFilters: () => void;
  setGhostMode: (enabled: boolean) => void;
  setCreatingEvent: (creating: boolean) => void;
  setSafetyReminderEvent: (event: SafetyReminderEvent | null) => void;
  // Set by whoever is pushing the overlay, from a measurement of the element it
  // is taking over. Null when the overlay is reached from somewhere with
  // nothing to hand over — a push notification, a deep link — and its header
  // then fades in where it belongs rather than flying from a made-up position.
  setHandoff: (handoff: Handoff | null) => void;
  // Called by the overlay itself on mount, not by whoever pushed it: a deep
  // link has to move the page aside too, and the overlay is the one thing every
  // route into it goes through.
  enterOverlay: () => void;
  // The start of the exit — the page beneath comes back.
  closeOverlay: () => void;
  // The route is gone — the handed-over element comes back. The handoff itself
  // survives, so a second visit flies from the same place.
  clearOverlay: () => void;
  // `source` defaults to 'browse' — every opener except the swipe deck screen
  // wants the generic save/advance contract, so only that one call site needs
  // to say so explicitly.
  dealCard: (
    ids: string[],
    index: number,
    origin: DealtOrigin | null,
    source?: DealtCardSource
  ) => void;
  advanceDealtCard: () => void;
  closeDealtCard: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeFilter: null,
  mapFilters: DEFAULT_MAP_FILTERS,
  searchRadius: CONFIG.defaultRadiusMeters,
  ghostMode: false,
  creatingEvent: false,
  safetyReminderEvent: null,
  inAppBanner: null,
  activeChat: null,
  overlayOpen: false,
  overlayMounted: false,
  handoff: null,
  dealtCard: null,
  setInAppBanner: (inAppBanner) => set({ inAppBanner }),
  setActiveChat: (activeChat) => set({ activeChat }),
  setFilter: (activeFilter) => set({ activeFilter }),
  setMapFilters: (mapFilters) => set({ mapFilters }),
  resetMapFilters: () => set({ mapFilters: DEFAULT_MAP_FILTERS }),
  setGhostMode: (ghostMode) => set({ ghostMode }),
  setCreatingEvent: (creatingEvent) => set({ creatingEvent }),
  setSafetyReminderEvent: (safetyReminderEvent) => set({ safetyReminderEvent }),
  setHandoff: (handoff) => set({ handoff }),
  enterOverlay: () => set({ overlayOpen: true, overlayMounted: true }),
  closeOverlay: () => set({ overlayOpen: false }),
  clearOverlay: () => set({ overlayOpen: false, overlayMounted: false }),
  // The touch-down tick (design doc §3) belongs here rather than in each of
  // the twelve call sites that can deal a card: this action is the one place
  // every one of them already goes through, deep link included (where there
  // was no touch to fire it from — harmless, since a selection tick with
  // nothing pressed just doesn't register as odd the way a stray impact
  // would). A store action causing a side effect is a small impurity, but
  // it's the cheaper trade against twelve copies of the same haptic call
  // that would silently drift out of sync with each other.
  dealCard: (ids, index, origin, source = 'browse') => {
    Haptics.selectionAsync();
    set({ dealtCard: { ids, index, origin, source } });
  },
  advanceDealtCard: () =>
    set((s) => {
      if (!s.dealtCard) return s;
      const next = s.dealtCard.index + 1;
      if (next >= s.dealtCard.ids.length) return { dealtCard: null };
      return { dealtCard: { ...s.dealtCard, index: next, origin: null } };
    }),
  closeDealtCard: () => set({ dealtCard: null }),
}));
