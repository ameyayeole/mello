import { NearbyEvent } from '@/types/models';
import type { BoostPack } from '@/services/iap';

// Boost — spending 1 boost credit makes an event "hot" for 24 hours: a
// distinct map pin, the Explore "🔥 Hot" tab, and top placement across the
// ranked feeds. Credits are bought in packs (consumable IAP, migration 028).
// Mirrors src/utils/premium.ts (colours + a right-now predicate).
export const BOOST_HOURS = 24;

export const BOOST_PACKS: {
  id: BoostPack;
  credits: number;
  price: number;
  label: string;
  note?: string;
}[] = [
  { id: 'single', credits: 1, price: 69, label: '1 Boost' },
  { id: 'pack5', credits: 5, price: 249, label: '5 Boosts', note: 'Save ₹96' },
];

// Hot-orange accent + tint used by the flame badge, the boosted pin and the
// host's boost card.
export const BOOST_ACCENT = '#FF6A2B';
export const BOOST_TINT = '#FFEDE3';
export const BOOST_EMOJI = '🔥';

// Boosted right now: prefer the feed's precomputed is_boosted flag, else fall
// back to the boosted_until timestamp (present on SELECT * event rows). Accepts
// any object carrying either field, so cards/pins/detail all share one check.
export function isBoosted(
  event:
    | Pick<NearbyEvent, 'is_boosted' | 'boosted_until'>
    | null
    | undefined
): boolean {
  if (!event) return false;
  if (event.is_boosted) return true;
  if (!event.boosted_until) return false;
  return new Date(event.boosted_until) > new Date();
}

// Whole hours remaining on a boost, for the host's "Boosted · Xh left" pill.
// Returns 0 once the boost has lapsed.
export function boostHoursLeft(
  event: Pick<NearbyEvent, 'boosted_until'> | null | undefined
): number {
  if (!event?.boosted_until) return 0;
  const ms = new Date(event.boosted_until).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 3_600_000));
}
