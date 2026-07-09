import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Per-session config, not a secret — "KYC + AML" workflow from the Didit console.
const WORKFLOW_ID = 'b1a71b6b-62be-407f-8d09-5f8651a56009';

// Deep link the hosted flow redirects back to; dismisses the in-app browser.
const CALLBACK_URL = 'mello://kyc/callback';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // The platform already verified the JWT signature (verify_jwt is on);
  // getUser resolves it to the caller so vendor_data can never be spoofed.
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const res = await fetch('https://verification.didit.me/v3/session/', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('DIDIT_API_KEY')!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      workflow_id: WORKFLOW_ID,
      vendor_data: user.id,
      callback: CALLBACK_URL,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('didit session create failed', res.status, detail);
    return new Response(JSON.stringify({ error: 'session_create_failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = await res.json();

  await supabase
    .from('profiles')
    .update({ kyc_status: 'in_progress', kyc_session_id: session.session_id })
    .eq('id', user.id);

  // Only what the client needs — never the api key or session_token.
  return new Response(
    JSON.stringify({ url: session.url, session_id: session.session_id }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
