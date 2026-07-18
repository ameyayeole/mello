import { supabase } from './supabase';
import { CheckinQr, CheckinResult } from '@/types/models';

// ─── Door check-in (migration 034) ───────────────────────────────────────────
// The host displays ONE QR for the event; approved attendees scan it and check
// themselves in via check_in_self. See supabase/migrations/034_checkin.sql.

// What the host's QR encodes. Versioned so old apps can reject future formats.
const QR_PREFIX = 'mello:checkin:1:';

export function buildCheckinPayload(eventId: string, token: string): string {
  return `${QR_PREFIX}${eventId}:${token}`;
}

// Returns null when the scanned QR isn't a Mello check-in code.
export function parseCheckinPayload(
  raw: string
): { eventId: string; token: string } | null {
  if (!raw.startsWith(QR_PREFIX)) return null;
  const [eventId, token] = raw.slice(QR_PREFIX.length).split(':');
  if (!eventId || !token) return null;
  return { eventId, token };
}

// ── Host side ────────────────────────────────────────────────────────────────

// Mints (or, with rotate, regenerates) and returns this event's door secret.
// Null when the caller isn't the host.
export async function getCheckinQr(
  eventId: string,
  rotate = false
): Promise<CheckinQr | null> {
  const { data, error } = await supabase.rpc('get_checkin_qr', {
    p_event_id: eventId,
    p_rotate: rotate,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.token) return null;
  return { token: row.token, code: row.code };
}

// Live roster for the host: user_id → checked_in_at. RLS lets the host read
// every participant row of their own event.
export async function getCheckinTimes(
  eventId: string
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('event_participants')
    .select('user_id, checked_in_at')
    .eq('event_id', eventId)
    .not('checked_in_at', 'is', null);
  if (error) throw error;
  return Object.fromEntries(
    ((data ?? []) as any[]).map((r) => [r.user_id, r.checked_in_at])
  );
}

// ── Attendee side ────────────────────────────────────────────────────────────

async function redeem(
  eventId: string,
  by: { token?: string; code?: string }
): Promise<CheckinResult> {
  const { data, error } = await supabase.rpc('check_in_self', {
    p_event_id: eventId,
    p_token: by.token ?? null,
    p_code: by.code ?? null,
  });
  if (error) throw error;
  return data as CheckinResult;
}

export const checkInWithToken = (eventId: string, token: string) =>
  redeem(eventId, { token });
export const checkInWithCode = (eventId: string, code: string) =>
  redeem(eventId, { code });

// My own check-in state, so the scanner screen can open straight to "you're in"
// if the host already checked me off, or another device did it.
export async function getMyCheckinTime(
  eventId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('event_participants')
    .select('checked_in_at')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as any)?.checked_in_at ?? null;
}

// ─── Scanner availability ────────────────────────────────────────────────────
// The installed binary predates expo-camera, so the live scanner only exists on
// builds that include the ExpoCamera native module (same gating pattern as
// compressForUpload in storage.service.ts).
export async function isLiveScannerAvailable(): Promise<boolean> {
  const { requireOptionalNativeModule } = await import('expo-modules-core');
  return !!requireOptionalNativeModule('ExpoCamera');
}

// ─── Photo-based QR decoding (works on today's binary) ───────────────────────
// Fallback scanner: the attendee snaps a photo of the host's QR with the regular
// ImagePicker camera, and we decode it in pure JS (jpeg-js + jsQR). Returns the
// decoded string, or null when no QR could be read.
export async function decodeQrFromJpeg(uri: string): Promise<string | null> {
  const [FileSystem, { decode: b64ToBuffer }, { default: jpeg }, { default: jsQR }] =
    await Promise.all([
      import('expo-file-system/legacy'),
      import('base64-arraybuffer'),
      import('jpeg-js'),
      import('jsqr'),
    ]);

  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const bytes = new Uint8Array(b64ToBuffer(base64));

  let img: { width: number; height: number; data: Uint8Array };
  try {
    // Cap memory so a 12MP shot degrades to "couldn't read" instead of OOM.
    img = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: 320,
    });
  } catch {
    return null;
  }

  // jsQR wants modest sizes; stride-downsample big photos to ~900px wide.
  const MAX_W = 900;
  const { width, height } = img;
  const rgba = img.data;
  if (width <= MAX_W) {
    const px = new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, width * height * 4);
    return jsQR(px, width, height)?.data ?? null;
  }

  const stride = Math.ceil(width / MAX_W);
  const w = Math.floor(width / stride);
  const h = Math.floor(height / stride);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * stride * width + x * stride) * 4;
      const dst = (y * w + x) * 4;
      out[dst] = rgba[src];
      out[dst + 1] = rgba[src + 1];
      out[dst + 2] = rgba[src + 2];
      out[dst + 3] = 255;
    }
  }
  return jsQR(out, w, h)?.data ?? null;
}
