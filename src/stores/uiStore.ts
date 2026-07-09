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

interface UIState {
  selectedEventId: string | null;
  activeFilter: ActivityId | null;
  // Map-tab filters (activity chips + the filter sheet). Separate from
  // activeFilter, which belongs to the Explore feed's chips.
  mapFilters: MapFilters;
  searchRadius: number;
  ghostMode: boolean;
  safetyReminderEvent: SafetyReminderEvent | null;
  setSelectedEvent: (id: string | null) => void;
  setFilter: (activity: ActivityId | null) => void;
  setMapFilters: (filters: MapFilters) => void;
  resetMapFilters: () => void;
  setRadius: (meters: number) => void;
  setGhostMode: (enabled: boolean) => void;
  setSafetyReminderEvent: (event: SafetyReminderEvent | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedEventId: null,
  activeFilter: null,
  mapFilters: DEFAULT_MAP_FILTERS,
  searchRadius: CONFIG.defaultRadiusMeters,
  ghostMode: false,
  safetyReminderEvent: null,
  setSelectedEvent: (selectedEventId) => set({ selectedEventId }),
  setFilter: (activeFilter) => set({ activeFilter }),
  setMapFilters: (mapFilters) => set({ mapFilters }),
  resetMapFilters: () => set({ mapFilters: DEFAULT_MAP_FILTERS }),
  setRadius: (searchRadius) => set({ searchRadius }),
  setGhostMode: (ghostMode) => set({ ghostMode }),
  setSafetyReminderEvent: (safetyReminderEvent) => set({ safetyReminderEvent }),
}));
