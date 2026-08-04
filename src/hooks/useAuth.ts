import { useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { getProfile } from '@/services/auth.service';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

export function useAuth() {
  const { session, user, isLoading, setSession, setUser, setLoading, clear } =
    useAuthStore();

  useEffect(() => {
    // Fetch the profile OUTSIDE any auth callback. Calling Supabase from inside
    // onAuthStateChange deadlocks the auth client (documented gotcha).
    async function loadProfile(userId: string) {
      try {
        const profile = await getProfile(userId);
        setUser(profile);
        // Ghost mode lives in the UI store because usePresence reads it, but it
        // is *persisted* on the profile — and nothing was carrying it back
        // across a launch. The store defaults to false with no persistence, so
        // every cold start silently un-ghosted the user and presence began
        // broadcasting again, while the settings toggle agreed and showed off.
        // This is the one place a profile is loaded, so it is the one place the
        // two copies can be reconciled.
        if (profile) useUIStore.getState().setGhostMode(!!profile.is_ghost_mode);
      } catch {
        setUser(null);
      } finally {
        // Only settle loading once the profile question is resolved, so the
        // AuthGuard never sees the transient session-but-no-user state and
        // flashes the profile-setup screen.
        setLoading(false);
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // Synchronous only — no awaited Supabase calls here.
        setSession(newSession);
        if (newSession?.user) {
          // Defer the Supabase call so it runs after the callback returns,
          // breaking the auth deadlock.
          setTimeout(() => loadProfile(newSession.user.id), 0);
        } else {
          setUser(null);
          // Don't let one account's ghost setting greet the next one that signs
          // in on this device before their profile has loaded.
          useUIStore.getState().setGhostMode(false);
          setLoading(false);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, user, isLoading, clear };
}
