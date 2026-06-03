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
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) loadProfile(data.session.user.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // Synchronous only — no awaited Supabase calls here.
        setSession(newSession);
        setLoading(false);
        if (newSession?.user) {
          // Defer the Supabase call so it runs after the callback returns,
          // breaking the auth deadlock.
          setTimeout(() => loadProfile(newSession.user.id), 0);
        } else {
          setUser(null);
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, user, isLoading, clear };
}
