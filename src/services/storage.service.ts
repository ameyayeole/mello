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
  const encoded = await encodeForUpload(uri, { maxWidth: 1280 });
  const path = `${userId}/photo-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}.${encoded.ext}`;

  await uploadFileFromUri('avatars', path, encoded.uri, encoded.contentType);

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

interface EncodedImage {
  uri: string;
  contentType: string;
  ext: string;
}

/**
 * The single encoder every image upload goes through: resizes to what a phone
 * viewport actually needs (`maxWidth`) and re-encodes as WEBP, falling back to
 * JPEG where WEBP encoding isn't supported. Keeping files small also prevents
 * EMSGSIZE ("Message too long") on iOS, where full-resolution camera-roll
 * photos (5–15 MB) overflow the socket buffer.
 */
async function encodeForUpload(
  uri: string,
  { maxWidth }: { maxWidth: number }
): Promise<EncodedImage> {
  // The currently installed native binary predates expo-image-manipulator being
  // added, so the module may be missing at runtime. Fall back to the original
  // file rather than crashing — the picker's low `quality` setting keeps files
  // small enough to upload in that case.
  const { requireOptionalNativeModule } = await import('expo-modules-core');
  if (!requireOptionalNativeModule('ExpoImageManipulator')) {
    return { uri, contentType: 'image/jpeg', ext: 'jpg' };
  }

  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
  const ref = await ImageManipulator.manipulate(uri)
    .resize({ width: maxWidth })
    .renderAsync();

  try {
    const webp = await ref.saveAsync({ compress: 0.75, format: SaveFormat.WEBP });
    return { uri: webp.uri, contentType: 'image/webp', ext: 'webp' };
  } catch {
    const jpeg = await ref.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
    return { uri: jpeg.uri, contentType: 'image/jpeg', ext: 'jpg' };
  }
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
  const encoded = await encodeForUpload(uri, { maxWidth: 1280 });
  const path = `${userId}/${Date.now()}.${encoded.ext}`;

  await uploadFileFromUri('event-photos', path, encoded.uri, encoded.contentType);

  const { data } = supabase.storage.from('event-photos').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Uploads a chat photo (event chat or DM) to the chat-media bucket, sized for
 * a message bubble on a phone screen (~260pt at 3x), not full resolution.
 */
export async function uploadChatPhoto(
  userId: string,
  uri: string
): Promise<string> {
  const encoded = await encodeForUpload(uri, { maxWidth: 800 });
  const path = `${userId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}.${encoded.ext}`;

  await uploadFileFromUri('chat-media', path, encoded.uri, encoded.contentType);

  const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Uploads a post-event wrap photo to the shared pool. Reuses the public
 * event-photos bucket (016 policies: public read, uid-folder write) with a
 * wrap-prefixed filename so pool photos are distinguishable from covers.
 */
export async function uploadWrapPhoto(
  userId: string,
  eventId: string,
  uri: string
): Promise<string> {
  const encoded = await encodeForUpload(uri, { maxWidth: 1280 });
  const path = `${userId}/wrap-${eventId}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}.${encoded.ext}`;

  await uploadFileFromUri('event-photos', path, encoded.uri, encoded.contentType);

  const { data } = supabase.storage.from('event-photos').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Whether saving to the camera roll is possible. expo-media-library ships JS
 * only for now — the native module arrives with the next binary build, so the
 * gallery hides its "Download all" button until then.
 */
export async function isMediaLibraryAvailable(): Promise<boolean> {
  const { requireOptionalNativeModule } = await import('expo-modules-core');
  return !!requireOptionalNativeModule('ExpoMediaLibrary');
}

/**
 * Downloads remote photo URLs into the app cache and saves each to the
 * device photo library. Returns the number saved. Throws if permission is
 * denied; call isMediaLibraryAvailable() first.
 */
export async function saveImagesToLibrary(urls: string[]): Promise<number> {
  const MediaLibrary = await import('expo-media-library');
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Photo library permission was not granted.');
  }

  let saved = 0;
  for (const url of urls) {
    const ext = url.split('.').pop()?.split('?')[0] ?? 'jpg';
    const target = `${FileSystem.cacheDirectory}wrap-${Date.now()}-${saved}.${ext}`;
    const dl = await FileSystem.downloadAsync(url, target);
    await MediaLibrary.saveToLibraryAsync(dl.uri);
    saved += 1;
  }
  return saved;
}
