import { StyleSheet } from 'react-native';
import { paletteGeneration } from '@/constants/colors';

/**
 * `StyleSheet.create`, deferred until something actually reads a style.
 *
 * A module-level `StyleSheet.create({ x: { color: COLORS.textPrimary } })` reads
 * the palette once, when the file is first imported — which is before the app
 * knows which theme it is in, and long before anyone can change it. That single
 * fact is what usually makes theming an app a 155-file refactor.
 *
 * This closes it with one line per file. The object literal moves inside a
 * thunk, so it is evaluated on first *access* instead of on import, and the
 * result is cached until the palette changes. `styles.row` still returns the
 * same object every render within a theme, so nothing downstream sees a new
 * style identity and re-renders for it.
 *
 *   const styles = themedStyles(() => ({ row: { color: COLORS.textPrimary } }));
 *
 * The factory takes no argument on purpose: `COLORS` is already a live view of
 * the active palette (see constants/colors), so the body of an existing
 * stylesheet needs no edits at all — only the wrapper around it.
 *
 * What it does **not** do is re-render anything. A component that does not
 * re-render keeps the styles it already read, so the theme also has to be
 * subscribed to somewhere above the tree — see `useThemeName` and the note in
 * stores/themeStore about where those subscriptions live.
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: () => T & StyleSheet.NamedStyles<unknown>
): T {
  let cached: T | null = null;
  let cachedAt = -1;

  const resolve = (): T => {
    const now = paletteGeneration();
    if (cached === null || cachedAt !== now) {
      cached = StyleSheet.create(factory());
      cachedAt = now;
    }
    return cached;
  };

  // Typed as the sheet itself, so call sites keep the exact key/value inference
  // `StyleSheet.create` gave them — a missing style is still a type error.
  return new Proxy({} as T, {
    get: (_target, key: string) => resolve()[key as keyof T],
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_target, key) =>
      Object.getOwnPropertyDescriptor(resolve(), key),
    has: (_target, key) => key in (resolve() as object),
  });
}
