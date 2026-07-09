import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Streams a local file to Supabase Storage with expo-file-system's uploadAsync.
// It reads the file from disk and sends it as the raw request body (BINARY_CONTENT),
// which avoids the iOS "Message too long" limit (hit by large base64/ArrayBuffer
// bodies through supabase-js) and Expo's winter `fetch`/FormData entirely. Hits
// the Storage REST endpoint directly with the caller's token so RLS still applies.
async function uploadFileFromUri(
  bucket: string,
  path: string,
  uri: string,
  contentType: string
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? SUPABASE_ANON_KEY;
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

  const res = await FileSystem.uploadAsync(uploadUrl, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    // Foreground session: the default BACKGROUND upload task fails on the iOS
    // Simulator with "Message too long" (EMSGSIZE) for non-trivial bodies.
    sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      'content-type': contentType,
      'x-upsert': 'true',
    },
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Upload failed (${res.status}): ${res.body}`);
  }
}

/**
 * Uploads a single profile gallery photo to Supabase Storage (avatars bucket,
 * under the owner's uid folder so the storage RLS policy allows it).
 *
 * The image is compressed to ≤1280 px wide JPEG first, then streamed from disk —
 * full-resolution camera-roll photos (5–15 MB) overflow the iOS socket buffer
 * ("Message too long" / EMSGSIZE) even through the streaming upload path.
 *
 * @param userId  the owner's UUID (used as the storage folder)
 * @param uri     the local file URI from ImagePicker (`assets[].uri`)
 */
export async function uploadProfilePhoto(
  userId: string,
  uri: string
): Promise<string> {
  const compressed = await compressForUpload(uri);
  const path = `${userId}/photo-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}.jpg`;

  await uploadFileFromUri('avatars', path, compressed, 'image/jpeg');

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Resolves a gallery photo list to public URLs, preserving order. Entries that
 * are already remote (`http`) URLs are kept as-is; local `file://` URIs picked
 * from the device are uploaded first. Returns the ordered list of public URLs.
 */
export async function uploadProfilePhotos(
  userId: string,
  uris: string[]
): Promise<string[]> {
  return Promise.all(
    uris.map((uri) =>
      uri.startsWith('http') ? Promise.resolve(uri) : uploadProfilePhoto(userId, uri)
    )
  );
}

/**
 * Compresses a local image to a 1280-px-wide JPEG before upload.
 * Prevents EMSGSIZE ("Message too long") on iOS when full-resolution photos
 * from the camera roll (5–15 MB) exceed the simulator/device socket buffer.
 */
async function compressForUpload(uri: string): Promise<string> {
  // The currently installed native binary predates expo-image-manipulator being
  // added, so the module may be missing at runtime. Fall back to the original
  // file rather than crashing — the picker's low `quality` setting keeps files
  // small enough to upload in that case.
  const { requireOptionalNativeModule } = await import('expo-modules-core');
  if (!requireOptionalNativeModule('ExpoImageManipulator')) return uri;

  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
  const ref = await ImageManipulator.manipulate(uri)
    .resize({ width: 1280 })
    .renderAsync();
  const result = await ref.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
  return result.uri;
}

/**
 * Uploads an event cover photo to Supabase Storage.
 * Stored under the host's uid folder (so the storage RLS policy allows it) with
 * a unique filename, since the event id isn't known until after the row is made.
 *
 * The image is compressed to ≤1280 px wide JPEG before upload so it stays well
 * under the iOS "Message too long" (EMSGSIZE) socket-buffer limit.
 *
 * @param userId  the host's UUID (used as the storage folder)
 * @param uri     the local file URI from ImagePicker (`assets[0].uri`)
 */
export async function uploadEventPhoto(
  userId: string,
  uri: string
): Promise<string> {
  const compressed = await compressForUpload(uri);
  const path = `${userId}/${Date.now()}.jpg`;

  await uploadFileFromUri('event-photos', path, compressed, 'image/jpeg');

  const { data } = supabase.storage.from('event-photos').getPublicUrl(path);
  return data.publicUrl;
}
