import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { error, count } = await supabase
    .from('events')
    .update({ is_active: false })
    .eq('is_active', true)
    .not('ends_at', 'is', null)
    .lt('ends_at', cutoff);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ deactivated: count ?? 0 }), {
    status: 200,
  });
});
