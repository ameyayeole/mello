import { Profile } from '@/types/models';

// Mello+ gold — used by the badge, the paywall and every locked-feature chip.
export const PREMIUM_GOLD = '#C9930A';
export const PREMIUM_GOLD_TINT = '#FBF3DC';

export const PREMIUM_PLANS = [
  {
    id: 'weekly' as const,
    label: 'Weekly',
    price: 99,
    per: 'week',
    hint: 'Try it out',
  },
  {
    id: 'monthly' as const,
    label: 'Monthly',
    price: 199,
    per: 'month',
    hint: 'Save 50%',
  },
];

// Premium right now: the flag is on and any expiry is still in the future.
// premium_until = null means no expiry (granted manually). Accepts any
// object carrying the two premium fields (full profiles or slim selects).
export function isPremium(
  user: Pick<Profile, 'is_premium' | 'premium_until'> | null | undefined
): boolean {
  if (!user?.is_premium) return false;
  if (!user.premium_until) return true;
  return new Date(user.premium_until) > new Date();
}
