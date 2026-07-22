import {
  Platform,
  StyleSheet,
  StyleProp,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS } from '@/constants/colors';
import { SHADOWS } from '@/constants/spacing';

// A frosted surface. The single most repeated thing in the design — search
// bars, plan rows, header buttons, the pills that float on photo cards — so it
// is one component with three tiers rather than the same six style properties
// copy-pasted into every screen. See DESIGN.md §3.
//
// The tier is chosen by how much the surface should assert itself, not by
// where it happens to sit:
//
//   chrome    the nav bar. The most opaque; content passes visibly under it.
//   panel     rows, search fields, header buttons. The default.
//   onPhoto   pills and icon buttons sitting on top of an image. The only dark
//             tier — smoked glass, so its white contents stay legible over a
//             bright photo and a dark one alike. Put white text on this one and
//             ink text on the other two.
//
// ── Android ──────────────────────────────────────────────────────────────────
// There is no true backdrop blur on Android. expo-blur can approximate one with
// `experimentalBlurMethod="dimezisBlurView"`, but it re-renders the view tree
// beneath on every frame, which is exactly the wrong trade for surfaces that
// live inside scrolling lists — and it is documented as crashing on some
// devices.
//
// So Android gets a flat translucent fill instead, at a higher opacity than the
// blurred version. It loses the blur; it keeps the layout, the bright edge, the
// shadow and the sense of a pane floating over the background. That is most of
// what the design is doing. Untested on a physical Android device.
//
// ── `backdrop`: frosting a pane from its own image ───────────────────────────
// A backdrop blur can only work with whatever is behind it, and that dependency
// is the source of a whole class of bug. Where the thing behind changes — a
// photo that stops partway down the screen, a rounded corner that lets a
// different layer through — the blur's output changes with it, and prints the
// boundary as a hard line across the glass.
//
// Pass `backdrop` and the pane composites that instead: no backdrop filter, so
// what sits behind stops mattering entirely. It also means **iOS and Android
// render the same thing**, because an image blur is ordinary image processing
// and needs no platform support. The caller owns positioning the backdrop — for
// a pane that scrolls, counter-translate it so the frost sits still like real
// glass rather than sliding with the surface.
export type GlassTier = 'chrome' | 'panel' | 'onPhoto';

const BLUR_INTENSITY: Record<GlassTier, number> = {
  chrome: 40,
  panel: 28,
  onPhoto: 22,
};

// Which way the native blur leans. `onPhoto` is the dark one — see the tier
// note above.
const TINT: Record<GlassTier, 'light' | 'dark'> = {
  chrome: 'light',
  panel: 'light',
  onPhoto: 'dark',
};

const FILL: Record<GlassTier, string> = {
  chrome: COLORS.glassChrome,
  panel: COLORS.glassPanel,
  onPhoto: COLORS.glassOnPhoto,
};

// Android's no-blur fallback: further from transparent, since there is no blur
// doing half the work.
const SOLID_FILL: Record<GlassTier, string> = {
  chrome: COLORS.glassChromeSolid,
  panel: COLORS.glassPanelSolid,
  onPhoto: COLORS.glassOnPhotoSolid,
};

const BORDER: Record<GlassTier, string> = {
  chrome: COLORS.glassBorder,
  panel: COLORS.glassBorder,
  onPhoto: COLORS.glassBorderOnPhoto,
};

const supportsBlur = Platform.OS === 'ios';

export function Glass({
  children,
  tier = 'panel',
  radius,
  edge = 'all',
  backdrop,
  // A pane over a photo has nothing behind it worth casting a shadow onto — the
  // card it sits on already has one — so the shadow is opt-out.
  shadow = true,
  style,
  onLayout,
}: {
  children?: React.ReactNode;
  tier?: GlassTier;
  radius: number;
  // `top` rounds the top corners only and draws the hairline across the top
  // edge alone — for a pane that runs off the bottom of the screen, where the
  // other three edges never meet anything and a corner down there would read
  // as the surface stopping short.
  edge?: 'all' | 'top';
  // What to frost, when the pane should not depend on what happens to be
  // behind it. Rendered inside the pane's clip, under the fill. See the note
  // above the tiers.
  backdrop?: React.ReactNode;
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
  // Measured like any other view. A segmented control needs its own width to
  // size the pill that slides inside it, and that measurement belongs to the
  // outer box `style` lands on — not to the pane, which is absolutely
  // positioned and would report the same number a frame later.
  onLayout?: ViewProps['onLayout'];
}) {
  // The pane is a clipped layer *behind* the children rather than their parent.
  //
  // Two reasons, both of which bit an earlier version. The pane needs
  // `overflow: 'hidden'` to clip the blur to its radius, and on Android that
  // also clips away the elevation shadow — so the shadow has to live on an
  // unclipped element. And `style` carries the caller's layout: padding, size,
  // position. Putting it on the pane meant padding shrank the glass instead of
  // insetting the content.
  //
  // With the fill absolutely positioned, `style` lands on the outer view where
  // layout belongs, and children lay out inside it normally.
  const hairline = StyleSheet.hairlineWidth * 2;
  const pane: ViewStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius,
    borderWidth: hairline,
    borderColor: BORDER[tier],
    overflow: 'hidden',
    ...(edge === 'top' && {
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderBottomWidth: 0,
      borderLeftWidth: 0,
      borderRightWidth: 0,
    }),
  };

  // `onPhoto` panes sit on a card that already casts one; a second shadow there
  // just muddies the image under it.
  const wantsShadow = shadow && tier !== 'onPhoto';

  return (
    <View
      style={[wantsShadow && SHADOWS.glass, { borderRadius: radius }, style]}
      onLayout={onLayout}
    >
      {backdrop ? (
        // Self-frosting: the caller's already-blurred layer, then the same wash
        // the blurred tiers get. No BlurView, so this path is identical on both
        // platforms — Android included.
        <View style={pane}>
          {backdrop}
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: FILL[tier] }]}
          />
        </View>
      ) : supportsBlur ? (
        // The blur is *inside* a plain clipping View rather than being the
        // clipping View itself. A `BlurView` does not reliably clip its own
        // backdrop to its border radius — the effect layer keeps drawing the
        // full rectangle — so at small radii the pane rendered as a square
        // corner peeking out from behind a round one, which reads as a
        // hexagon. Most visible on a 22pt disc; present on every size.
        //
        // An ordinary View honours `overflow: 'hidden'` on both platforms, so
        // clipping there and letting the blur fill it is the reliable order.
        // This is the same shape the `backdrop` path above already uses.
        <View style={pane}>
          <BlurView
            intensity={BLUR_INTENSITY[tier]}
            tint={TINT[tier]}
            style={StyleSheet.absoluteFill}
          />
          {/* The blur alone is grey and lifeless. The wash over it is what
              turns "the background, out of focus" into "a pane of glass" —
              white for the light tiers, smoked ink for `onPhoto`. */}
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: FILL[tier] }]}
          />
        </View>
      ) : (
        <View style={[pane, { backgroundColor: SOLID_FILL[tier] }]} />
      )}
      {children}
    </View>
  );
}
