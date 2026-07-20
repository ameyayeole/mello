import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { Profile } from '@/types/models';
import { errorProp } from '@/utils/errors';

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

// The ExpoAppleAuthentication native module isn't in the current binary (can't
// rebuild yet) — load lazily and treat "missing" as unavailable so the login
// screen only shows the Apple button after a native rebuild. Same pattern as
// ExpoIap in iap.ts. Apple Sign-In is an App Store requirement (guideline 4.8)
// because we offer Google login.
async function getAppleAuth() {
  if (Platform.OS !== 'ios') return null;
  const { requireOptionalNativeModule } = await import('expo-modules-core');
  if (!requireOptionalNativeModule('ExpoAppleAuthentication')) return null;
  return await import('expo-apple-authentication');
}

export async function appleSignInAvailable(): Promise<boolean> {
  const apple = await getAppleAuth();
  if (!apple) return false;
  try {
    return await apple.isAvailableAsync();
  } catch {
    return false;
  }
}

// Thrown when the user closes Apple's sign-in sheet — not an error state.
export class AppleSignInCancelled extends Error {}

export async function signInWithApple(): Promise<void> {
  const apple = await getAppleAuth();
  if (!apple) throw new Error('Apple Sign-In is not available on this device.');

  let credential;
  try {
    credential = await apple.signInAsync({
      requestedScopes: [
        apple.AppleAuthenticationScope.FULL_NAME,
        apple.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e) {
    if (errorProp(e, 'code') === 'ERR_REQUEST_CANCELED')
      throw new AppleSignInCancelled();
    throw e;
  }

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
}

// Where Supabase's confirmation emails (signup verify + email change) deep-link
// back to. Must be in the dashboard's Redirect URLs list.
function confirmRedirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: 'mello', path: 'auth/confirm' });
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// Returns true when the account needs email confirmation before signing in
// (dashboard "Confirm email" is on → signUp returns a user but no session).
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: confirmRedirectUri() },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function resendSignupEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: confirmRedirectUri() },
  });
  if (error) throw error;
}

export async function exchangeAuthCode(code: string): Promise<void> {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
}

// Sends a confirmation link to the new address; the change only applies once
// it's clicked (and lands on auth/confirm via the deep link).
export async function changeEmail(newEmail: string): Promise<void> {
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: confirmRedirectUri() }
  );
  if (error) throw error;
}

// Re-checks the current password before a password change. Supabase's
// updateUser doesn't require it, but changing a password without proving the
// old one would let anyone with a briefly unlocked phone lock the owner out.
export async function verifyCurrentPassword(password: string): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) return false;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return !error;
}

// Deleting the auth user requires the service role, so it runs in the
// delete-account edge function; profiles (and everything FK'd to it) cascade.
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account');
  if (error || !data?.ok) {
    throw new Error('Could not delete your account. Please try again.');
  }
  await supabase.auth.signOut();
}

export async function sendPasswordReset(email: string): Promise<void> {
  // The email's link bounces through Supabase's verify endpoint, then deep-links
  // back into the app with a PKCE code (?code=…) that reset-password.tsx
  // exchanges for a session. The URI must be in Supabase's Redirect URLs list.
  const redirectTo = AuthSession.makeRedirectUri({
    scheme: 'mello',
    path: 'auth/reset-password',
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
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
