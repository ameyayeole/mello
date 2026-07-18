import { Platform } from 'react-native';
import { supabase } from './supabase';

// Mello+ store billing: Apple In-App Purchase on iOS, Google Play Billing on
// Android. The store owns the payment method, the autopay mandate and the
// 1-month free introductory offer configured on these products; after a
// purchase the verify-iap edge function validates it with the store servers
// and flips the guarded premium columns on the buyer's profile.
//
// Product ids — must exist with these exact ids in App Store Connect and
// Play Console (Play: one subscription per id with a base plan + a "1 month
// free" offer; ASC: one subscription group with an introductory offer).
export const IAP_SKUS = {
  weekly: 'mello.plus.weekly',
  monthly: 'mello.plus.monthly',
} as const;
export type PremiumPlan = keyof typeof IAP_SKUS;

// Boost packs — one-off consumables (not subscriptions). Buying a pack adds
// boost CREDITS to the buyer's profile (verify-boost + migration 028); the
// host then spends credits on events from the app. Must exist with these
// exact ids as Consumables in App Store Connect / in-app products in Play
// Console.
export const BOOST_PACK_SKUS = {
  single: 'mello.boost.single', // 1 boost  · ₹69
  pack5: 'mello.boost.pack5', //   5 boosts · ₹249
} as const;
export type BoostPack = keyof typeof BOOST_PACK_SKUS;

// The ExpoIap native module isn't in the current binary (can't rebuild yet) —
// load lazily and treat "missing" as IAP-unavailable so the paywall can fall
// back gracefully. Same pattern as ExpoImageManipulator in storage.service.
async function getIap() {
  const { requireOptionalNativeModule } = await import('expo-modules-core');
  if (!requireOptionalNativeModule('ExpoIap')) return null;
  return await import('expo-iap');
}

export async function iapAvailable(): Promise<boolean> {
  return (await getIap()) !== null;
}

// Thrown when the user closes the store's payment sheet — not an error state.
export class PurchaseCancelled extends Error {}

// Sends the store's proof of purchase to verify-iap, which grants premium
// server-side. iOS proof = the StoreKit 2 JWS; Android = the purchase token.
async function grantOnServer(
  purchaseToken: string,
  productId: string
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('verify-iap', {
    body: { platform: Platform.OS, productId, purchaseToken },
  });
  if (error || !data?.ok) {
    throw new Error('Purchase could not be verified');
  }
}

// Runs the full purchase flow for a plan. Resolves true when the store
// purchase went through AND the server granted premium; false when the
// native module is missing (old binary). Throws PurchaseCancelled when the
// user backs out of the payment sheet.
export async function purchasePremium(plan: PremiumPlan): Promise<boolean> {
  const iap = await getIap();
  if (!iap) return false;

  const sku = IAP_SKUS[plan];
  await iap.initConnection();
  try {
    // Play Billing requires the offer token of the subscription's offer
    // (which carries the 1-month-free phase); StoreKit needs the fetch to
    // warm its product cache before the purchase sheet.
    const products = (await iap.fetchProducts({
      skus: [sku],
      type: 'subs',
    })) as any[];
    const offerToken: string | undefined = (products ?? [])
      .find((p) => p?.id === sku)
      ?.subscriptionOfferDetailsAndroid?.[0]?.offerToken;

    // requestPurchase is event-based: the result arrives via the listeners.
    const purchase = await new Promise<any>((resolve, reject) => {
      const updSub = iap.purchaseUpdatedListener((p: any) => {
        cleanup();
        resolve(p);
      });
      const errSub = iap.purchaseErrorListener((e: any) => {
        cleanup();
        reject(
          e?.code === 'user-cancelled' || e?.code === 'E_USER_CANCELLED'
            ? new PurchaseCancelled()
            : new Error(e?.message ?? 'Purchase failed')
        );
      });
      const cleanup = () => {
        updSub.remove();
        errSub.remove();
      };
      iap
        .requestPurchase({
          request: {
            apple: { sku },
            google: {
              skus: [sku],
              ...(offerToken
                ? { subscriptionOffers: [{ sku, offerToken }] }
                : {}),
            },
          },
          type: 'subs',
        } as any)
        .catch((e: any) => {
          cleanup();
          reject(e);
        });
    });

    const token: string | undefined =
      purchase?.purchaseToken ?? purchase?.purchaseTokenAndroid;
    if (!token) throw new Error('Store returned no purchase token');

    // Server first, then finish: an unfinished transaction re-delivers on
    // next launch, so a failed verification can be retried; finishing first
    // could swallow a paid purchase.
    await grantOnServer(token, sku);
    await iap.finishTransaction({ purchase, isConsumable: false });
    return true;
  } finally {
    iap.endConnection();
  }
}

// Runs a boost-pack purchase (a consumable, so type 'in-app' and isConsumable
// on finish — packs can be bought again and again). Resolves true when the
// store purchase went through AND verify-boost credited the buyer's balance;
// false when the native module is missing (old binary) so the caller can fall
// back gracefully. Throws PurchaseCancelled when the user backs out.
export async function purchaseBoostPack(pack: BoostPack): Promise<boolean> {
  const iap = await getIap();
  if (!iap) return false;

  const sku = BOOST_PACK_SKUS[pack];
  await iap.initConnection();
  try {
    // Warm the product cache (StoreKit needs it before the purchase sheet).
    await iap.fetchProducts({ skus: [sku], type: 'in-app' });

    const purchase = await new Promise<any>((resolve, reject) => {
      const updSub = iap.purchaseUpdatedListener((p: any) => {
        cleanup();
        resolve(p);
      });
      const errSub = iap.purchaseErrorListener((e: any) => {
        cleanup();
        reject(
          e?.code === 'user-cancelled' || e?.code === 'E_USER_CANCELLED'
            ? new PurchaseCancelled()
            : new Error(e?.message ?? 'Purchase failed')
        );
      });
      const cleanup = () => {
        updSub.remove();
        errSub.remove();
      };
      iap
        .requestPurchase({
          request: {
            apple: { sku },
            google: { skus: [sku] },
          },
          type: 'in-app',
        } as any)
        .catch((e: any) => {
          cleanup();
          reject(e);
        });
    });

    const token: string | undefined =
      purchase?.purchaseToken ?? purchase?.purchaseTokenAndroid;
    if (!token) throw new Error('Store returned no purchase token');

    // Server credits the balance, then we finish the consumable so the pack
    // can be bought again.
    const { data, error } = await supabase.functions.invoke('verify-boost', {
      body: {
        platform: Platform.OS,
        productId: sku,
        purchaseToken: token,
      },
    });
    if (error || !data?.ok) throw new Error('Purchase could not be verified');

    await iap.finishTransaction({ purchase, isConsumable: true });
    return true;
  } finally {
    iap.endConnection();
  }
}

// "Restore purchases" (required by Apple): re-validates the user's existing
// store subscription (new phone, reinstall) and re-grants premium. Resolves
// true when an active subscription was found.
export async function restorePremium(): Promise<boolean> {
  const iap = await getIap();
  if (!iap) return false;

  await iap.initConnection();
  try {
    const purchases = ((await iap.getAvailablePurchases()) ?? []) as any[];
    const skus = Object.values(IAP_SKUS) as string[];
    const own = purchases.filter((p) =>
      skus.includes(p?.productId ?? p?.id)
    );
    if (own.length === 0) return false;

    // Newest first — only the latest transaction can still be active.
    own.sort(
      (a, b) => (b?.transactionDate ?? 0) - (a?.transactionDate ?? 0)
    );
    const latest = own[0];
    const token: string | undefined =
      latest?.purchaseToken ?? latest?.purchaseTokenAndroid;
    if (!token) return false;

    await grantOnServer(token, latest?.productId ?? latest?.id ?? '');
    return true;
  } finally {
    iap.endConnection();
  }
}
