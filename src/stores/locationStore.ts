import { create } from 'zustand';
import { Coords } from '@/types/models';

interface LocationState {
  coords: Coords | null;
  cityName: string;
  setLocation: (coords: Coords, cityName?: string) => void;
  clearLocation: () => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  coords: null,
  cityName: 'Nearby',
  setLocation: (coords, cityName) =>
    set((s) => ({ coords, cityName: cityName ?? s.cityName })),
  clearLocation: () => set({ coords: null, cityName: 'Nearby' }),
}));
