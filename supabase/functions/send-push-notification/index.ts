import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface PushPayload {
  recipient_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

serve(async (req) => {
  const { recipient_id, title, body, data }: PushPayload = await req.json();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', recipient_id)
    .single();

  if (!profile?.expo_push_token) {
    return new Response('No push token', { status: 200 });
  }

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: profile.expo_push_token,
      title,
      body,
      data: data ?? {},
      sound: 'default',
      priority: 'high',
    }),
  });

  return new Response('OK', { status: 200 });
});
