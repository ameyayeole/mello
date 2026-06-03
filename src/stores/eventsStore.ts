import { create } from 'zustand';

interface EventsState {
  savedEventIds: Set<string>;
  setSavedIds: (ids: string[]) => void;
  toggleSaved: (eventId: string) => void;
  isSaved: (eventId: string) => boolean;
}

export const useEventsStore = create<EventsState>((set, get) => ({
  savedEventIds: new Set(),
  setSavedIds: (ids) => set({ savedEventIds: new Set(ids) }),
  toggleSaved: (eventId) =>
    set((s) => {
      const next = new Set(s.savedEventIds);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return { savedEventIds: next };
    }),
  isSaved: (eventId) => get().savedEventIds.has(eventId),
}));
