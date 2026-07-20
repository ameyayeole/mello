import { supabase } from './supabase';

// Quirky one-liners the home header rotates through (migration 037).
// Managed from the Supabase dashboard — edit rows to change copy in-app.
export async function getGreetingLines(): Promise<string[]> {
  const { data, error } = await supabase
    .from('greeting_lines')
    .select('text')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw error;
  return (data ?? []).map((row) => row.text);
}
