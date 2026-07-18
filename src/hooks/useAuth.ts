import { useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { getProfile } from '@/services/auth.service';
import { useAuthStore } from '@/stores/authStore';

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
          setLoading(false);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, user, isLoading, clear };
}
