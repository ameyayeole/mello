import { StatusBar } from 'expo-status-bar';
import { useBarStyle } from '@/stores/themeStore';

/**
 * The status bar, following the theme: dark glyphs on the light palette, light
 * glyphs on the dark one.
 *
 * A component rather than a hook call in each screen, because the screens that
 * need it are the ones NOT built on `Screen` (which already resolves its own) —
 * they had `<StatusBar style="dark" />` hardcoded, and a drop-in replacement
 * needs no other change to the file.
 *
 * Screens whose bar sits over a *photo* — profile, the wrap — keep their
 * hardcoded `light`. That bar is on an image, not on the theme.
 */
export default function ThemedStatusBar() {
  return <StatusBar style={useBarStyle()} />;
}
