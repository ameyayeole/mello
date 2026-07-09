import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { timingSafeEqual } from 'https://deno.land/std@0.168.0/crypto/timing_safe_equal.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Deployed with --no-verify-jwt: Didit can't send a Supabase JWT. Authenticity
// comes from the X-Signature-V2 HMAC below — the webhook is the source of
// truth for verification decisions, never the client.

// Didit's canonicalisation for X-Signature-V2: whole-number floats (1.0)
// become integers, then keys are sorted recursively, then JSON.stringify.
function shortenFloats(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shortenFloats);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shortenFloats(x)])
    );
  }
  if (typeof v === 'number' && !Number.isInteger(v) && v % 1 === 0) return Math.trunc(v);
  return v;
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

// Didit session status (exact case-sensitive literals) → profiles.kyc_status.
const STATUS_MAP: Record<string, string> = {
  Approved: 'approved',
  Declined: 'declined',
  'In Review': 'pending_review',
  'In Progress': 'in_progress',
  'Awaiting User': 'in_progress',
  Resubmitted: 'in_progress',
  'Kyc Expired': 'expired',
  Abandoned: 'none',
  Expired: 'none',
};

serve(async (req) => {
  const raw = await req.text();
  const sig = req.headers.get('x-signature-v2') ?? '';
  const ts = Number(req.headers.get('x-timestamp'));

  // Freshness — replay protection.
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) {
    return new Response('stale', { status: 401 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const canonical = JSON.stringify(sortKeys(shortenFloats(parsed)));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(Deno.env.get('DIDIT_WEBHOOK_SECRET')!),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(new TextEncoder().encode(expected), new TextEncoder().encode(sig))
  ) {
    return new Response('bad sig', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Idempotency — event_id is unique per delivery attempt; a replayed or
  // retried delivery hits the primary key and is acknowledged without effect.
  const { error: dedupeError } = await supabase
    .from('kyc_webhook_events')
    .insert({ event_id: String(parsed.event_id) });
  if (dedupeError) {
    if (dedupeError.code === '23505') return new Response('ok'); // already processed
    console.error('dedupe insert failed', dedupeError);
    return new Response('error', { status: 500 }); // 5xx → Didit retries
  }

  const kycStatus = STATUS_MAP[String(parsed.status)];
  const userId = String(parsed.vendor_data ?? '');
  if (kycStatus && userId) {
    const update: Record<string, unknown> = { kyc_status: kycStatus };
    if (parsed.status === 'Approved') {
      update.kyc_verified_at = new Date().toISOString();
    } else if (parsed.status === 'Kyc Expired') {
      update.kyc_verified_at = null;
    }
    const { error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', userId)
      .eq('kyc_session_id', String(parsed.session_id));
    if (error) console.error('profile kyc update failed', error);
  }

  // 2xx within 5s — "Not Started" and unknown statuses are acknowledged no-ops.
  return new Response('ok');
});
