import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from './supabase';
import { getProfile } from './auth.service';
import { Profile } from '@/types/models';

// Identity verification (KYC) via Didit's hosted flow. The edge function
// creates the session server-side (the API key never reaches the app); we
// open the returned URL in the in-app auth browser. The decision itself is
// written by the didit-webhook edge function — the redirect back here is a
// UI hint only, so callers must re-fetch the profile for the real status.

export async function startKycVerification(): Promise<'completed' | 'dismissed'> {
  const { data, error } = await supabase.functions.invoke('didit-create-session');
  if (error) throw new Error('Could not start verification. Please try again.');
  if (!data?.url) throw new Error('Verification is unavailable right now.');

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'mello',
    path: 'kyc/callback',
  });

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
  return result.type === 'success' ? 'completed' : 'dismissed';
}

// The webhook usually lands within a few seconds of the flow finishing.
// Poll briefly so the UI can flip to the decided state without a manual
// refresh; returns the latest profile either way.
export async function pollKycStatus(userId: string): Promise<Profile | null> {
  const delays = [1500, 2500, 4000, 6000, 8000];
  let latest: Profile | null = null;
  for (const delay of delays) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    latest = await getProfile(userId);
    const status = latest?.kyc_status;
    if (status && status !== 'none' && status !== 'in_progress') break;
  }
  return latest;
}
