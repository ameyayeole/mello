import { useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { getProfile } from '@/services/auth.service';
import { useAuthStore } from '@/stores/authStore';

export function useAuth() {
  const { session, user, isLoading, setSession, setUser, setLoading, clear } =
    useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        const profile = await getProfile(data.session.user.id);
        setUser(profile);
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          const profile = await getProfile(newSession.user.id);
          setUser(profile);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, user, isLoading, clear };
}
