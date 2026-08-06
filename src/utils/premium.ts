import { Profile } from '@/types/models';

// Mello+ gold — used by the badge, the paywall and every locked-feature chip.
import { activePaletteName } from '@/constants/colors';

export const PREMIUM_GOLD = '#C9930A';

/**
 * The wash behind a gold glyph or pill.
 *
 * A function, not a constant, because it depends on the theme: `#FBF3DC` is a
 * pale cream — a tint on a white surface, and a bright patch on a near-black
 * one. The dark form is the same hue as an alpha wash instead, so it lifts off
 * whatever it is on. Called at render, like every other palette read.
 */
export function premiumGoldTint(): string {
  return activePaletteName() === 'dark'
    ? 'rgba(201, 147, 10, 0.20)'
    : '#FBF3DC';
}
// The same gold lifted for dark surfaces. #C9930A is tuned to carry on white;
// on the profile sheet it goes muddy brown, and the tint disappears entirely.
export const PREMIUM_GOLD_ON_DARK = '#E0B45E';
export const PREMIUM_GOLD_TINT_ON_DARK = 'rgba(224, 180, 94, 0.22)';
export const PREMIUM_GOLD_BORDER_ON_DARK = 'rgba(224, 180, 94, 0.45)';

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
