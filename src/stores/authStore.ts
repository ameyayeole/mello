import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { Profile } from '@/types/models';

interface AuthState {
  session: Session | null;
  user: Profile | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setUser: (user: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,
  setSession: (session) => set({ session }),
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  clear: () => set({ session: null, user: null, isLoading: false }),
}));
