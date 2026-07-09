import { create } from 'zustand';
import { ActivityId } from '@/types/models';
import { CONFIG } from '@/constants/config';

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
  searchRadius: number;
  ghostMode: boolean;
  safetyReminderEvent: SafetyReminderEvent | null;
  setSelectedEvent: (id: string | null) => void;
  setFilter: (activity: ActivityId | null) => void;
  setRadius: (meters: number) => void;
  setGhostMode: (enabled: boolean) => void;
  setSafetyReminderEvent: (event: SafetyReminderEvent | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedEventId: null,
  activeFilter: null,
  searchRadius: CONFIG.defaultRadiusMeters,
  ghostMode: false,
  safetyReminderEvent: null,
  setSelectedEvent: (selectedEventId) => set({ selectedEventId }),
  setFilter: (activeFilter) => set({ activeFilter }),
  setRadius: (searchRadius) => set({ searchRadius }),
  setGhostMode: (ghostMode) => set({ ghostMode }),
  setSafetyReminderEvent: (safetyReminderEvent) => set({ safetyReminderEvent }),
}));
