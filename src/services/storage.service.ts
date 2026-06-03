import { supabase } from './supabase';
import { decode } from 'base64-arraybuffer';

/**
 * Uploads a profile avatar to Supabase Storage.
 * @param userId  the owner's UUID (used as the storage folder)
 * @param base64  the image encoded as a base64 string (from ImagePicker `base64: true`)
 * @param ext     file extension, e.g. 'jpg' | 'png'
 */
export async function uploadAvatar(
  userId: string,
  base64: string,
  ext = 'jpg'
): Promise<string> {
  const path = `${userId}/profile.${ext}`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, decode(base64), {
      contentType: `image/${ext}`,
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  // cache-bust so the new image shows immediately after re-upload
  return `${data.publicUrl}?t=${Date.now()}`;
}
