import { Alert } from 'react-native';

// Pulls a displayable message off anything thrown. Supabase throws
// PostgrestError (a plain object with .message, not an Error), services throw
// Error, and a rejected fetch can surface a bare string — so none of the usual
// narrowing works on its own.
//
// The fallback matters: the previous `catch (e: any) { alert(e.message) }`
// pattern showed users a literally empty alert whenever the thrown value had no
// message, which is exactly the case where they most need to be told something.
export function errorMessage(
  e: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (typeof e === 'string') return e.trim() || fallback;
  if (e instanceof Error) return e.message.trim() || fallback;
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return fallback;
}

export function showError(e: unknown, title = 'Error'): void {
  Alert.alert(title, errorMessage(e));
}

// Reads a string property off an unknown thrown value without asserting its
// whole shape — for the cases where the *kind* of failure matters, not the
// text: DOMException.name === 'AbortError', Apple's ERR_REQUEST_CANCELED code.
export function errorProp(e: unknown, key: string): string | undefined {
  if (e && typeof e === 'object' && key in e) {
    const value = (e as Record<string, unknown>)[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}
