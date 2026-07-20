import { create } from 'zustand';
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

interface UIState {
  selectedEventId: string | null;
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
  setSelectedEvent: (id: string | null) => void;
  setInAppBanner: (banner: InAppBanner | null) => void;
  setActiveChat: (key: string | null) => void;
  setFilter: (activity: ActivityId | null) => void;
  setMapFilters: (filters: MapFilters) => void;
  resetMapFilters: () => void;
  setGhostMode: (enabled: boolean) => void;
  setCreatingEvent: (creating: boolean) => void;
  setSafetyReminderEvent: (event: SafetyReminderEvent | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedEventId: null,
  activeFilter: null,
  mapFilters: DEFAULT_MAP_FILTERS,
  searchRadius: CONFIG.defaultRadiusMeters,
  ghostMode: false,
  creatingEvent: false,
  safetyReminderEvent: null,
  inAppBanner: null,
  activeChat: null,
  setSelectedEvent: (selectedEventId) => set({ selectedEventId }),
  setInAppBanner: (inAppBanner) => set({ inAppBanner }),
  setActiveChat: (activeChat) => set({ activeChat }),
  setFilter: (activeFilter) => set({ activeFilter }),
  setMapFilters: (mapFilters) => set({ mapFilters }),
  resetMapFilters: () => set({ mapFilters: DEFAULT_MAP_FILTERS }),
  setGhostMode: (ghostMode) => set({ ghostMode }),
  setCreatingEvent: (creatingEvent) => set({ creatingEvent }),
  setSafetyReminderEvent: (safetyReminderEvent) => set({ safetyReminderEvent }),
}));
