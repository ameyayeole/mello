import { supabase } from './supabase';

// Whether `giverId` has given a thumbs to `receiverId`.
export async function hasThumbed(
  giverId: string,
  receiverId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('thumbs')
    .select('giver_id')
    .eq('giver_id', giverId)
    .eq('receiver_id', receiverId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

export async function giveThumb(
  giverId: string,
  receiverId: string
): Promise<void> {
  const { error } = await supabase
    .from('thumbs')
    .insert({ giver_id: giverId, receiver_id: receiverId });

  if (error) throw error;
}

export async function removeThumb(
  giverId: string,
  receiverId: string
): Promise<void> {
  const { error } = await supabase
    .from('thumbs')
    .delete()
    .eq('giver_id', giverId)
    .eq('receiver_id', receiverId);

  if (error) throw error;
}
