import { create } from 'zustand';
import { ActivityId } from '@/types/models';
import { CONFIG } from '@/constants/config';

interface UIState {
  selectedEventId: string | null;
  activeFilter: ActivityId | null;
  searchRadius: number;
  ghostMode: boolean;
  setSelectedEvent: (id: string | null) => void;
  setFilter: (activity: ActivityId | null) => void;
  setRadius: (meters: number) => void;
  setGhostMode: (enabled: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedEventId: null,
  activeFilter: null,
  searchRadius: CONFIG.defaultRadiusMeters,
  ghostMode: false,
  setSelectedEvent: (selectedEventId) => set({ selectedEventId }),
  setFilter: (activeFilter) => set({ activeFilter }),
  setRadius: (searchRadius) => set({ searchRadius }),
  setGhostMode: (ghostMode) => set({ ghostMode }),
}));
