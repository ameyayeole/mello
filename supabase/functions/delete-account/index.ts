import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Permanently deletes the CALLER's account (App Store guideline 5.1.1(v)
// requires in-app account deletion). Deployed WITH JWT verification (the
// default): only a signed-in user can call it, and only their own auth user is
// ever deleted — profiles and everything FK'd to it cascade via
// ON DELETE CASCADE (migration 002).
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
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userId = userData.user.id;

  // Best-effort: clear the user's uploaded files so no orphaned avatars/chat
  // images linger in storage. Failures here never block the account deletion.
  try {
    for (const bucket of ['avatars', 'chat-media', 'event-photos']) {
      const { data: files } = await supabase.storage
        .from(bucket)
        .list(userId, { limit: 100 });
      if (files?.length) {
        await supabase.storage
          .from(bucket)
          .remove(files.map((f) => `${userId}/${f.name}`));
      }
    }
  } catch (_) {
    // storage cleanup is best-effort
  }

  const { error: deleteErr } = await supabase.auth.admin.deleteUser(userId);
  if (deleteErr) {
    return new Response(
      JSON.stringify({ ok: false, error: deleteErr.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
