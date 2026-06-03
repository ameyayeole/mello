import { AppState } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store rejects/hangs on values larger than ~2KB. Supabase session
// tokens exceed that, which deadlocks every authenticated request. This adapter
// transparently splits large values across multiple SecureStore entries.
const CHUNK_SIZE = 1800;
const CHUNK_MARKER = '__mello_chunks__:';

// ── Raw chunked SecureStore helpers ──────────────────────────────────────────
async function rawGet(key: string): Promise<string | null> {
  const head = await SecureStore.getItemAsync(key);
  if (head === null) return null;
  if (!head.startsWith(CHUNK_MARKER)) return head;
  const count = parseInt(head.slice(CHUNK_MARKER.length), 10);
  let value = '';
  for (let i = 0; i < count; i++) {
    const part = await SecureStore.getItemAsync(`${key}__${i}`);
    if (part === null) return null;
    value += part;
  }
  return value;
}

async function rawClearChunks(key: string): Promise<void> {
  const prev = await SecureStore.getItemAsync(key);
  if (prev?.startsWith(CHUNK_MARKER)) {
    const prevCount = parseInt(prev.slice(CHUNK_MARKER.length), 10);
    for (let i = 0; i < prevCount; i++) {
      await SecureStore.deleteItemAsync(`${key}__${i}`);
    }
  }
}

async function rawSet(key: string, value: string): Promise<void> {
  await rawClearChunks(key);
  if (value.length <= CHUNK_SIZE) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  const count = Math.ceil(value.length / CHUNK_SIZE);
  for (let i = 0; i < count; i++) {
    await SecureStore.setItemAsync(
      `${key}__${i}`,
      value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    );
  }
  await SecureStore.setItemAsync(key, `${CHUNK_MARKER}${count}`);
}

async function rawRemove(key: string): Promise<void> {
  await rawClearChunks(key);
  await SecureStore.deleteItemAsync(key);
}

// ── Non-blocking adapter ─────────────────────────────────────────────────────
// supabase-js `await`s these during sign-in/refresh, so they must NEVER block on
// the keychain. We serve reads/writes from an in-memory cache (instant) and
// persist to SecureStore in a background queue that auth never waits on.
const memCache = new Map<string, string | null>();

let persistQueue: Promise<unknown> = Promise.resolve();
function persistInBackground(fn: () => Promise<void>) {
  persistQueue = persistQueue.then(fn, fn).catch(() => {});
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(fallback);
      }
    }, ms);
    p.then((v) => {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(v);
      }
    }).catch(() => {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(fallback);
      }
    });
  });
}

const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (memCache.has(key)) return memCache.get(key) ?? null;
    // Cold read (app start). Bounded so a stuck keychain can't hang startup.
    const value = await withTimeout(rawGet(key), 4000, null);
    memCache.set(key, value);
    return value;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    memCache.set(key, value); // instant — auth proceeds immediately
    persistInBackground(() => rawSet(key, value));
  },

  removeItem: async (key: string): Promise<void> => {
    memCache.set(key, null);
    persistInBackground(() => rawRemove(key));
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE returns an auth `code` in the query string (correct for mobile),
    // instead of the implicit flow's tokens in the URL hash fragment.
    flowType: 'pkce',
    // processLock avoids the navigator.locks deadlock that hangs auth calls
    // (sign-in, token refresh) in React Native.
    lock: processLock,
  },
});

// Only auto-refresh the session while the app is in the foreground (recommended
// React Native setup — avoids refresh timers firing in the background).
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
