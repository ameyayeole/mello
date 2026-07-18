import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as jose from 'https://esm.sh/jose@5';

// Verifies an Apple / Google Play CONSUMABLE purchase of a boost PACK and
// credits the buyer's profiles.boost_credits (via grant_boost_credits, 028).
// Boosting an event itself no longer costs money at this endpoint — the host
// spends a credit through the use_boost() RPC from the app.
//
// Deployed WITH JWT verification: the caller must be a signed-in Mello user;
// credits always land on the caller's own profile.
//
//   iOS     → a StoreKit 2 JWS transaction. We take its transactionId and ask
//             the App Store Server API for the signed transaction — Apple's TLS
//             response is the source of trust, never the client blob.
//   Android → a Play Billing purchase token, checked against the
//             androidpublisher products endpoint (and acknowledged so Google
//             doesn't auto-refund it after 3 days).
//
// Idempotent on the store transaction id: grant_boost_credits inserts into
// boost_purchases (PK txn_id) first, so a re-delivered finished transaction
// never double-credits.
//
// Secrets: same as verify-iap (APPLE_ISSUER_ID / APPLE_KEY_ID /
// APPLE_PRIVATE_KEY / GOOGLE_SERVICE_ACCOUNT_JSON / IAP_BUNDLE_ID).

// Pack SKUs → credits. Must exist as Consumables in App Store Connect and
// in-app products in Play Console with these exact ids.
const BOOST_PACKS: Record<string, number> = {
  'mello.boost.single': 1, // ₹69
  'mello.boost.pack5': 5, // ₹249
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

function decodeJwsPayload(jws: string): Record<string, unknown> {
  return JSON.parse(
    new TextDecoder().decode(jose.base64url.decode(jws.split('.')[1]))
  );
}

async function verifyApple(
  clientJws: string
): Promise<{ txnId: string; productId: string } | null> {
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
  if (!(productId in BOOST_PACKS)) return null;
  // Refunded / revoked purchases grant nothing.
  if (txn.revocationDate != null) return null;

  return { txnId: String(txn.transactionId ?? transactionId), productId };
}

// ── Google: androidpublisher products ─────────────────────────────────────────
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
): Promise<{ txnId: string; productId: string } | null> {
  if (!(productId in BOOST_PACKS)) return null;

  const token = await googleAccessToken();
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${bundleId()}`;

  const res = await fetch(
    `${base}/purchases/products/${productId}/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const purchase = await res.json();

  // purchaseState 0 = purchased (1 = cancelled, 2 = pending).
  if (purchase.purchaseState !== 0) return null;

  // Acknowledge so Google doesn't auto-refund after 3 days.
  if (purchase.acknowledgementState === 0) {
    await fetch(
      `${base}/purchases/products/${productId}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
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

  return { txnId: purchase.orderId ?? purchaseToken, productId };
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

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
  if (!body.purchaseToken || !body.platform || !body.productId) {
    return new Response('bad request', { status: 400 });
  }

  try {
    const result =
      body.platform === 'ios'
        ? await verifyApple(body.purchaseToken)
        : await verifyGoogle(body.purchaseToken, body.productId);

    if (!result) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'no_valid_purchase' }),
        { status: 402, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const credits = BOOST_PACKS[result.productId];

    // Idempotent: grant_boost_credits returns false when this txn_id already
    // sits in boost_purchases — re-delivery grants nothing extra.
    const { error: grantErr } = await supabase.rpc('grant_boost_credits', {
      p_user_id: userId,
      p_txn_id: result.txnId,
      p_product_id: result.productId,
      p_platform: body.platform === 'ios' ? 'apple' : 'google',
      p_credits: credits,
    });
    if (grantErr) throw grantErr;

    const { data: profile } = await supabase
      .from('profiles')
      .select('boost_credits')
      .eq('id', userId)
      .single();

    return new Response(
      JSON.stringify({ ok: true, boost_credits: profile?.boost_credits ?? 0 }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('verify-boost failed:', e);
    return new Response('verification failed', { status: 500 });
  }
});
