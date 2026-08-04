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

// The open card: one event, and where it flew from.
//
// This used to be `{ ids: string[]; index: number }` — a whole deck plus which
// card was face up — with an `advanceDealtCard` action to step the index. All
// three are gone, and the reason is in `EventDealtCard`'s own comment: tapping
// a pin, a feed card or a search result is asking about a SINGLE event, and
// dealing strangers' events out behind the one you asked for made the map read
// like a shuffled pile rather than an answer to the thing you tapped. The
// many-deep, quota-aware stack is `EventDeck` now, reached from the map's own
// fan. That is a decision with a rationale, not a pause, so the shape that
// modelled the old behaviour goes with it.
//
// It was not merely dead weight. `advanceDealtCard` had no caller left in the
// app, so `index` could never be anything but the value passed in and every
// opener was reading `ids[index]` back out of an array it had just built — and
// seven of them built that array on every tap. A pin tap ran a `flatMap` over
// every cluster on the map to fill a field nothing read.
//
// There used to be a `source: 'browse' | 'swipeDeck'` discriminant here too,
// carrying whether a swipe should spend one of the day's swipes (the deck) or
// just advance (everywhere else). Deleted along with the swipe deck's branch of
// `EventDealtCard` (see `EventDeck`), for the same reason.
export interface DealtCardState {
  id: string;
  origin: DealtOrigin | null;
  // Bumped by every `dealCard`. `EventDealtCard` keys the card component on
  // it, so dealing a fresh card remounts.
  //
  // Replacing a card in place — the "Happening near you" rail on the back face
  // calls `dealCard` while a card is already open — otherwise reused the same
  // mounted component: its deal effect is mount-only, and nothing reset the
  // flip (the swipe path resets it in `commit`, this path has no swipe). The
  // new event appeared instantly, with no deal animation, already showing its
  // back.
  token: number;
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
  dealCard: (id: string, origin: DealtOrigin | null) => void;
  closeDealtCard: () => void;
  // True while the map's event deck is expanded. The tab bar reads it and
  // steps aside, the same way it does for the create flow — which is what
  // lets the deck live INSIDE the tabs tree (so its parked fan tucks behind
  // the bar, as the teaser's did) and still cover the whole screen when open.
  deckExpanded: boolean;
  setDeckExpanded: (deckExpanded: boolean) => void;

  // Settings and the screens it opens share one background: the sub-screens are
  // transparent and slide only their *contents* over the backdrop Settings is
  // already painting. Two flags, because each screen has to know something
  // about the other that it cannot see from its own route.
  //
  //   settingsRootMounted — is the Settings list underneath us? A sub-screen
  //     reached from there needs no backdrop of its own. Reached from anywhere
  //     else (Edit profile is also opened from the Profile tab) there is
  //     nothing behind it and it has to bring one.
  //
  //   settingsPanelOpen — is a sub-screen holding the foreground? Settings
  //     reads it to slide its own rows out of the way, so the two contents
  //     change places over a backdrop that never moves.
  settingsRootMounted: boolean;
  settingsPanelOpen: boolean;
  setSettingsRootMounted: (mounted: boolean) => void;
  setSettingsPanelOpen: (open: boolean) => void;
}

// A monotonic counter rather than a timestamp: two deals in the same
// millisecond would collide on `Date.now()`, and "the deck was replaced" is
// exactly the case where they can.
let dealToken = 0;

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
  settingsRootMounted: false,
  settingsPanelOpen: false,
  setSettingsRootMounted: (settingsRootMounted) => set({ settingsRootMounted }),
  setSettingsPanelOpen: (settingsPanelOpen) => set({ settingsPanelOpen }),
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
  // the fifteen call sites across ten files that can deal a card: this action
  // is the one place every one of them already goes through, deep link
  // included (where there was no touch to fire it from — harmless, since a
  // selection tick with nothing pressed just doesn't register as odd the way a
  // stray impact would). A store action causing a side effect is a small
  // impurity, but it's the cheaper trade against fifteen copies of the same
  // haptic call that would silently drift out of sync with each other.
  dealCard: (id, origin) => {
    Haptics.selectionAsync();
    dealToken += 1;
    set({ dealtCard: { id, origin, token: dealToken } });
  },
  closeDealtCard: () => set({ dealtCard: null }),
  deckExpanded: false,
  setDeckExpanded: (deckExpanded) => set({ deckExpanded }),
}));
