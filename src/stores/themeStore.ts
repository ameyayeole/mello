import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { applyPalette, type ThemeName } from '@/constants/colors';

const KEY = 'mello.theme';

/**
 * Which palette the app is in, and the two places that has to be true at once:
 * the module-level `active` palette that every `COLORS.x` reads (set by
 * `applyPalette`), and this store, which components subscribe to so they
 * re-render and read it again.
 *
 * **Where the subscriptions are, and why so few.** Changing a theme has to
 * re-render the tree, and only a component that subscribes will. Rather than a
 * hook in all 155 files, `useThemeName` is called in the shells every screen is
 * already inside — the root layout, the tabs layout, `AppBackground` and
 * `Screen` — and React does the rest: re-rendering a parent re-renders its
 * children, and each child re-reads its styles through the `themedStyles` proxy
 * on the way down.
 *
 * The exception is a `React.memo`'d subtree with unchanged props, which will
 * keep its old styles until something else re-renders it. Those are the create
 * flow's steps (memoised on purpose — see AGENTS.md) and they are behind a modal
 * flow you cannot be inside while changing a setting.
 *
 * Persisted with SecureStore because that is the only key-value store this app
 * has. It is the wrong tool for a preference — it is an encrypted keychain — but
 * adding AsyncStorage for one string is worse, and `safety.ts` already keeps
 * its seen-flags there for the same reason.
 */
type ThemeState = {
  name: ThemeName;
  // False until the stored choice has been read. The root layout holds the
  // splash screen until it flips, so the first frame is never the wrong theme.
  loaded: boolean;
  setTheme: (name: ThemeName) => void;
  load: () => Promise<void>;
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  name: 'light',
  loaded: false,

  setTheme: (name) => {
    if (name === get().name) return;
    // Palette first, store second: the store update is what re-renders, and it
    // must not re-render onto a palette that has not moved yet.
    applyPalette(name);
    set({ name });
    SecureStore.setItemAsync(KEY, name).catch(() => {});
  },

  load: async () => {
    let stored: string | null = null;
    try {
      stored = await SecureStore.getItemAsync(KEY);
    } catch {
      // A keychain read can fail on a device that has never unlocked. Light is
      // the app's own default; failing to read a preference is not a reason to
      // hold the splash screen.
    }
    const name: ThemeName = stored === 'dark' ? 'dark' : 'light';
    applyPalette(name);
    set({ name, loaded: true });
  },
}));

/** Subscribe to the active theme. Returning the name, not the palette, because
 *  the palette is reached through `COLORS` — this is only here to re-render. */
export function useThemeName(): ThemeName {
  return useThemeStore((s) => s.name);
}

/**
 * What the status bar's glyphs should be. The opposite of the background they
 * sit on — dark glyphs on the light theme, light glyphs on the dark one.
 *
 * A hook rather than a constant so the screens that set their own status bar
 * also subscribe: it is the cheapest place to put the subscription that makes a
 * mounted screen follow a theme change.
 *
 * Screens over a *photo* (profile, the wrap) still hardcode `light`, and should
 * — their bar sits on an image, not on the theme.
 */
export function useBarStyle(): 'light' | 'dark' {
  return useThemeStore((s) => (s.name === 'dark' ? 'light' : 'dark'));
}

/**
 * What a `MapView` should render as. The app's theme, not the phone's — the map
 * is a surface inside this app, so it follows the app's choice even when the two
 * disagree.
 *
 * `react-native-maps` handles both platforms natively from this one prop: iOS
 * sets `overrideUserInterfaceStyle` on the MKMapView (Apple's own dark tiles),
 * Android sets `MapColorScheme.DARK` (Google's). Neither needs the hand-rolled
 * style JSON a dark map usually costs.
 *
 * One caveat, and it is the reason the root layout remounts on a theme change:
 * Android reads this from the map's *initial* props, so a live update does not
 * re-tint an existing map. iOS does update live.
 */
export function useMapScheme(): 'light' | 'dark' {
  return useThemeStore((s) => s.name);
}
