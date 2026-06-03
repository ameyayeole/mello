import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { Profile } from '@/types/models';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogle(): Promise<void> {
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'mello',
    path: 'auth/callback',
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('No OAuth URL returned');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

  // User dismissed/cancelled the browser
  if (result.type !== 'success') return;

  // Use Expo's Linking parser — React Native's URL.searchParams is unreliable.
  const parsed = Linking.parse(result.url);
  const params: Record<string, string> = {
    ...((parsed.queryParams ?? {}) as Record<string, string>),
  };

  // Fallback: some flows put tokens/code in the URL hash fragment (#a=b&c=d),
  // which Linking.parse does not include in queryParams.
  const hashIndex = result.url.indexOf('#');
  if (hashIndex !== -1) {
    const fragment = result.url.slice(hashIndex + 1);
    for (const pair of fragment.split('&')) {
      const [k, v] = pair.split('=');
      if (k && v) params[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }

  if (params.error_description) throw new Error(params.error_description);
  if (params.error) throw new Error(params.error);

  if (params.code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
      params.code
    );
    if (exchangeError) throw exchangeError;
    return;
  }

  // Some flows return tokens directly in the URL fragment instead of a code.
  if (params.access_token && params.refresh_token) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (sessionError) throw sessionError;
    return;
  }

  throw new Error('Sign-in did not return a session. Check Supabase redirect URLs.');
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) throw error;
  return data as Profile;
}

export async function createProfile(
  userId: string,
  profile: Partial<Profile>
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: userId, ...profile })
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function updateProfile(
  userId: string,
  updates: Partial<Profile>
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
}
