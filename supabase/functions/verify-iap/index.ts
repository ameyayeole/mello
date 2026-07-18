import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as jose from 'https://esm.sh/jose@5';

// Verifies an Apple / Google Play subscription purchase server-side and flips
// the guarded premium columns on the buyer's profile. Deployed WITH JWT
// verification (the default): the caller must be a signed-in Mello user, and
// premium is only ever granted to the caller's own profile.
//
// The client (expo-iap) sends a unified purchaseToken:
//   iOS     → a StoreKit 2 JWS transaction. We take its transactionId and ask
//             the App Store Server API for the signed transaction — Apple's
//             TLS response is the source of trust, never the client blob.
//   Android → a Play Billing purchase token, checked against the
//             androidpublisher subscriptionsv2 endpoint (and acknowledged).
//
// The 1-month free trial is an introductory offer configured on the store
// products — the store collects the payment method + autopay mandate and
// reports a normal subscription whose expiry is the trial end, so trials and
// paid periods flow through here identically.
//
// Secrets (supabase secrets set):
//   APPLE_ISSUER_ID              App Store Connect → Users and Access → Integrations
//   APPLE_KEY_ID                 id of the App Store Connect API key
//   APPLE_PRIVATE_KEY            the .p8 contents (PEM, ES256)
//   GOOGLE_SERVICE_ACCOUNT_JSON  Play Console service account key (full JSON)
//   IAP_BUNDLE_ID                com.yourcompany.mello (shared by both stores)

const PRODUCT_PLANS: Record<string, 'weekly' | 'monthly'> = {
  'mello.plus.weekly': 'weekly',
  'mello.plus.monthly': 'monthly',
};

interface Body {
  platform: 'ios' | 'android';
  productId: string;
  purchaseToken: string;
}

const bundleId = () => Deno.env.get('IAP_BUNDLE_ID') ?? 'com.yourcompany.mello';

// ── Apple: App Store Server API ───────────────────────────────────────────────
async function appleApiJwt(): Promise<string> {
  const key = await jose.importPKCS8(
    Deno.env.get('APPLE_PRIVATE_KEY') ?? '',
    'ES256'
  );
  return await new jose.SignJWT({ bid: bundleId() })
    .setProtectedHeader({
      alg: 'ES256',
      kid: Deno.env.get('APPLE_KEY_ID') ?? '',
      typ: 'JWT',
    })
    .setIssuer(Deno.env.get('APPLE_ISSUER_ID') ?? '')
    .setAudience('appstoreconnect-v1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

// Payload of a JWS without local signature checks — only ever used on data we
// received from Apple over TLS, or to extract a transactionId that Apple then
// confirms.
function decodeJwsPayload(jws: string): Record<string, unknown> {
  return JSON.parse(
    new TextDecoder().decode(jose.base64url.decode(jws.split('.')[1]))
  );
}

async function verifyApple(
  clientJws: string
): Promise<{ expiresAt: Date; txnId: string; productId: string } | null> {
  let transactionId: string;
  try {
    transactionId = String(decodeJwsPayload(clientJws).transactionId ?? '');
  } catch {
    return null;
  }
  if (!transactionId) return null;

  const jwt = await appleApiJwt();
  const path = `/inApps/v1/transactions/${transactionId}`;
  let res = await fetch(`https://api.storekit.itunes.apple.com${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (res.status === 404) {
    // Sandbox purchase (TestFlight / dev build).
    res = await fetch(
      `https://api.storekit-sandbox.itunes.apple.com${path}`,
      { headers: { Authorization: `Bearer ${jwt}` } }
    );
  }
  if (!res.ok) return null;

  const { signedTransactionInfo } = await res.json();
  const txn = decodeJwsPayload(signedTransactionInfo);

  if (txn.bundleId !== bundleId()) return null;
  const productId = String(txn.productId ?? '');
  if (!(productId in PRODUCT_PLANS)) return null;
  // Revoked (refunded / family-sharing revoked) subscriptions grant nothing.
  if (txn.revocationDate != null) return null;

  const expiresAt = new Date(Number(txn.expiresDate));
  if (!txn.expiresDate || expiresAt <= new Date()) return null;

  return {
    expiresAt,
    txnId: String(txn.originalTransactionId ?? transactionId),
    productId,
  };
}

// ── Google: androidpublisher subscriptionsv2 ─────────────────────────────────
async function googleAccessToken(): Promise<string> {
  const sa = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? '{}');
  const key = await jose.importPKCS8(sa.private_key, 'RS256');
  const jwt = await new jose.SignJWT({
    scope: 'https://www.googleapis.com/auth/androidpublisher',
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('google oauth failed');
  return data.access_token;
}

async function verifyGoogle(
  purchaseToken: string,
  productId: string
): Promise<{ expiresAt: Date; txnId: string } | null> {
  const token = await googleAccessToken();
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${bundleId()}`;

  const res = await fetch(
    `${base}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const sub = await res.json();

  // ACTIVE covers paid AND free-trial periods; IN_GRACE_PERIOD keeps access
  // while Google retries a failed renewal payment.
  const state = sub.subscriptionState as string;
  if (
    state !== 'SUBSCRIPTION_STATE_ACTIVE' &&
    state !== 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
  ) {
    return null;
  }
  const line = (sub.lineItems ?? [])[0];
  if (!line?.expiryTime) return null;
  const expiresAt = new Date(line.expiryTime);
  if (expiresAt <= new Date()) return null;

  // Unacknowledged subscriptions are auto-refunded by Google after 3 days.
  if (sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
    await fetch(
      `${base}/purchases/subscriptions/${productId}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }
    );
  }

  return { expiresAt, txnId: sub.latestOrderId ?? purchaseToken };
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  // Identify the buyer from their Supabase JWT — premium only ever lands on
  // the caller's own profile.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const authHeader = req.headers.get('Authorization') ?? '';
  const { data: userData, error: userErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (userErr || !userData.user) {
    return new Response('unauthorized', { status: 401 });
  }
  const userId = userData.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }
  if (!body.purchaseToken || !body.platform) {
    return new Response('bad request', { status: 400 });
  }

  try {
    let result:
      | { expiresAt: Date; txnId: string; productId?: string }
      | null = null;
    let productId = body.productId;

    if (body.platform === 'ios') {
      result = await verifyApple(body.purchaseToken);
      if (result?.productId) productId = result.productId;
    } else {
      result = await verifyGoogle(body.purchaseToken, body.productId);
    }

    if (!result) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'no_active_subscription' }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        is_premium: true,
        premium_until: result.expiresAt.toISOString(),
        premium_plan: PRODUCT_PLANS[productId] ?? null,
        premium_source: body.platform === 'ios' ? 'apple' : 'google',
        premium_txn_id: result.txnId,
      })
      .eq('id', userId);
    if (error) throw error;

    return new Response(
      JSON.stringify({
        ok: true,
        premium_until: result.expiresAt.toISOString(),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('verify-iap failed:', e);
    return new Response('verification failed', { status: 500 });
  }
});
