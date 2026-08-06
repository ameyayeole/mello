// Two palettes, one shape, and a live view onto whichever is active.
//
// `COLORS` is a Proxy, not an object. Every `COLORS.x` in the app resolves
// against `active` at the moment it is *read* rather than at import time, which
// is what lets the theme change without touching 155 files: JSX props and
// anything inside a function are read during render, so they follow the theme
// on their own.
//
// The one thing that does not is a module-level `StyleSheet.create({…})` — its
// values are read once, when the module first loads. Those are wrapped in
// `themedStyles` (src/theme.ts), which defers the same object literal to first
// access and re-runs it when the palette changes. That is the whole migration:
// one call per file, no hooks, no props threaded anywhere.
//
// Adding a colour means adding it to BOTH palettes — `DARK` is typed as the
// same shape as `LIGHT`, so leaving one out is a type error rather than a
// screen that goes invisible in one theme.

export const LIGHT = {
  // Brand
  primary: '#F95B5B',
  primaryLight: '#FF8E8B',
  primaryTint: '#FDECEC',
  primaryDark: '#993232',
  // The unfilled remainder of a coral progress arc — the create-flow pin's
  // spinner runs `primary` over this. Alpha rather than `primaryTint` because
  // it sits on a white circle *and* over the map, and a solid tint only works
  // against one of those.
  primaryTrack: 'rgba(249, 91, 91, 0.18)',
  secondary: '#6D4AD6',
  secondaryTint: '#EEE9FB',
  // The app black. Cooler and bluer than the old #17151A — see the note on the
  // neutral ramp below.
  accent: '#1A1D24',
  accentMid: '#2C303A',

  // Surfaces
  //
  // `background` is the flat fallback. Inside `(tabs)` the real backdrop is
  // <AppBackground>, a gradient with two drifting blobs, and screens there run
  // transparent so it shows through. This value is what everything outside the
  // tab navigator still paints.
  background: '#F2F2F4',
  surface: '#FFFFFF',
  white: '#FFFFFF',

  // Borders
  border: 'rgba(0, 0, 0, 0.10)',
  borderSoft: 'rgba(0, 0, 0, 0.06)',

  // Glass — the three tiers from DESIGN.md §3, by how much the surface should
  // assert itself. Fill and border go together; picking one without the other
  // is what makes a panel read as flat white instead of glass.
  //
  // <Glass> applies these. Reach for the tokens directly only when you need the
  // fill on something Glass can't wrap.
  glassChrome: 'rgba(255, 255, 255, 0.72)', // nav bar
  glassPanel: 'rgba(255, 255, 255, 0.68)', // rows, search, header buttons
  glassBorder: 'rgba(255, 255, 255, 0.95)',

  // On-photo glass is **dark**, not translucent white. A white pill on a photo
  // either disappears into a bright image or reads as a hole punched in a dark
  // one; smoked glass sits on top of anything and keeps white text legible
  // over both. The border stays a light hairline so it still reads as glass
  // rather than as a flat black chip.
  glassOnPhoto: 'rgba(15, 24, 44, 0.46)',
  glassBorderOnPhoto: 'rgba(255, 255, 255, 0.18)',

  // Android has no true backdrop blur, so glass there is a flat fill. It has to
  // sit further from transparent than the blurred version or the surface
  // disappears into whatever it was meant to float over.
  glassPanelSolid: 'rgba(255, 255, 255, 0.86)',
  glassChromeSolid: 'rgba(255, 255, 255, 0.90)',
  glassOnPhotoSolid: 'rgba(15, 24, 44, 0.58)',

  // The two shadow colours. Never neutral grey: a grey shadow over a tinted
  // background reads as a smudge. `ink` carries the blue-black one (see below);
  // this is its warm counterpart, used under photo cards so the shadow agrees
  // with the coral in the backdrop.
  shadowWarm: '#5A2D32',

  // The backdrop gradient and its drifting blob. Kept here rather than in
  // AppBackground so the one place colours live stays the one place.
  bgGradientTop: '#EEF1F7',
  bgGradientMid: '#F4F2F8',
  bgGradientBottom: '#F8F6F9',
  bgBlobCool: '#8CA0F0', // periwinkle, top-right

  // Ink — the blue-black neutral this app shadows and dims with. The literal
  // #0F182C / rgba(15,24,44,…) appears ~160 times across screens; these are the
  // rungs that were actually in use, named.
  ink: '#0F182C',
  inkFaint: 'rgba(15, 24, 44, 0.04)', // locked / read-only field fill
  inkSubtle: 'rgba(15, 24, 44, 0.07)', // selected chip over a blurred backdrop
  // The tab-bar chip while it's "picked up" (long-press scrub): a rung darker
  // than inkSubtle so the grabbed chip lifts off the bar. `OnDark` is the same
  // idea over the Profile bar, brighter than fillOnDarkStrong for the same lift.
  chipGrab: 'rgba(15, 24, 44, 0.16)',
  chipGrabOnDark: 'rgba(255, 255, 255, 0.30)',
  placeholder: 'rgba(15, 24, 44, 0.40)', // TextInput placeholderTextColor
  inkLabel: 'rgba(15, 24, 44, 0.50)', // small field labels
  scrim: 'rgba(15, 24, 44, 0.45)', // modal / sheet backdrop
  // A chip sitting directly on a photo — the remove button on a photo tile.
  // Heavier than `scrim` because it has to hold a white glyph legible over an
  // arbitrary image, not just dim what's behind it.
  scrimOnPhoto: 'rgba(15, 24, 44, 0.65)',
  // Behind a fullscreen photo viewer. Far heavier than `scrim`: a lightbox has
  // to kill the page behind it or the photo competes with it — but stopping
  // short of solid keeps the screen underneath sensed rather than replaced,
  // which is what makes it read as opening over the page instead of cutting to
  // a different one.
  lightbox: 'rgba(9, 14, 26, 0.94)',
  // Knocks a full-bleed photo back far enough that white type over it stays
  // legible without hiding the photo. Lighter than `scrim`, which is there to
  // push a whole screen away, not to temper one.
  inkVeil: 'rgba(15, 24, 44, 0.28)',

  // Text — a cool blue-grey ramp, retuned from the warm one the app shipped
  // with (#17151A / #8A8690 / #A8A2AA).
  //
  // The mockup's whole neutral scale is blue-grey; the app's was warm, and a
  // warm grey next to the periwinkle-and-coral background reads as dirty rather
  // than as a different hue. Changed here rather than at ~105 call sites, which
  // is the point of having the token.
  //
  // The two lower rungs also got *darker* (secondary 54%→39% lightness), so
  // meta text gains contrast rather than losing it.
  textPrimary: '#1A1D24',
  textSecondary: '#6D7280',
  textMuted: '#8A8F9C',
  // Uppercase eyebrow labels above a section or card title.
  textEyebrow: '#9198A6',

  // ── On a dark frosted surface ────────────────────────────────────────────
  // The ink ramp inverted, for content sitting on `onPhoto` glass — today the
  // profile sheet, which is a dark pane over the user's own photo. Primary text
  // there is plain `white`; these are the two rungs below it.
  //
  // The two fills are a translucent white *lift*, not another glass tier: a
  // card inside an already-blurred sheet does not need a blur of its own, and
  // giving it one costs a native blur view per row and reads as mud over the
  // image. Use them for cards nested in a dark pane; use <Glass> for the pane.
  textOnDark: 'rgba(255, 255, 255, 0.72)',
  textOnDarkMuted: 'rgba(255, 255, 255, 0.56)',
  // Two rungs, same reason the ink ramp has several: `fillOnDark` is a card
  // lifted off the sheet, `fillOnDarkStrong` is a chip lifted off a card that
  // is already lifted — the emoji circle inside a translucent category pill.
  // One rung cannot do both without the chip vanishing or the card shouting.
  fillOnDark: 'rgba(255, 255, 255, 0.08)',
  fillOnDarkStrong: 'rgba(255, 255, 255, 0.16)',
  borderOnDark: 'rgba(255, 255, 255, 0.14)',

  // ── Skeletons ────────────────────────────────────────────────────────────
  // The placeholder fill, and the light that sweeps it. Stronger than
  // `inkSubtle` (7%), which is tuned for a selected chip and disappears against
  // `glassPanel` — a bone has to read as a shape, not as a smudge.
  skeletonBone: 'rgba(15, 24, 44, 0.10)',
  skeletonSheen: 'rgba(255, 255, 255, 0.45)',
  // The same pair for bones on a surface that is dark in *both* themes — the
  // `onPhoto` sheet. Identical in each palette, exactly as `fillOnDark` and
  // `borderOnDark` are, and for the same reason: they were built for a surface
  // that does not change. Without them the locked wishlist's bones would be
  // dark ink on dark glass on the light theme.
  skeletonBoneOnDark: 'rgba(255, 255, 255, 0.09)',
  skeletonSheenOnDark: 'rgba(255, 255, 255, 0.16)',

  // Status
  success: '#17915A',
  successTint: '#E4F1EB',
  // "Attending" — the counterpart to coral "Hosting" on plan rows. Blue because
  // the pairing has to survive red/green colour blindness, which coral+success
  // does not.
  attending: '#4C8DF6',
  attendingTint: '#E8F0FE',
  verified: '#2C5AC7',
  error: '#EF4444',
  // The wash behind a destructive glyph. Alpha rather than a flat tint so it
  // works over glass as well as over `surface` — the literal it replaces
  // (rgba(239,68,68,0.10)) was written out by hand in two confirm dialogs.
  errorTint: 'rgba(239,68,68,0.10)',
  warning: '#C8791E',
  online: '#22C55E',
  disabled: '#D8D5DA',

  // Category accents
  catCoffee: '#C8791E',
  catDrinks: '#F95B5B',
  catMusic: '#6D4AD6',
  catTrekking: '#17915A',
  catGym: '#2A6FDB',

  // Per-popup accents for the pre-join safety queue. Each popup is colour-
  // coded to what it is warning about, which is why these are not the brand
  // ramp: purple for the women-only space, amber for a new-host caution, pink
  // for the party/alcohol note. Values carried unchanged from the sheet these
  // popups used to live in.
  safetyWomen: '#7C5CE0',
  safetyWomenTint: '#F0ECFC',
  safetyCaution: '#C8791E',
  safetyCautionTint: '#FBF0E2',
  safetyParty: '#D6478E',
  safetyPartyTint: '#FBE7F1',
} as const;

export type Palette = { [K in keyof typeof LIGHT]: string };

/**
 * Dark, and specifically *this app's* dark: the profile screen, which has been
 * a dark surface since long before there was a theme. Nothing here is invented.
 *
 *   background   `LIGHT.accent`, the app black — profile's own `container`
 *   surfaces     the translucent white lifts profile already uses for the cards
 *                inside its sheet (`fillOnDark`, `fillOnDarkStrong`)
 *   text         white, then profile's two on-dark rungs at 72% and 56%
 *   borders      profile's `borderOnDark`
 *
 * So the whole app is now the treatment that one screen was already carrying,
 * which is what makes this a theme rather than a second design.
 *
 * The brand ramp does not invert. Coral on near-black is the same coral, and a
 * "dark mode primary" would make the one colour that means *decide* stop
 * meaning it. Only its tint moves — a pale wash is invisible on black, so the
 * tints become dim washes of the same hue.
 */
export const DARK: Palette = {
  // ── Brand ────────────────────────────────────────────────────────────────
  primary: '#FF6B6B', // a touch lighter: #F95B5B on near-black loses its bite
  primaryLight: '#FF8E8B',
  primaryTint: 'rgba(255, 107, 107, 0.16)',
  primaryDark: '#C24A4A',
  primaryTrack: 'rgba(255, 107, 107, 0.20)',
  secondary: '#9B7DF0',
  secondaryTint: 'rgba(155, 125, 240, 0.18)',
  // A raised charcoal, NOT an inverted near-white.
  //
  // `accent` is the app black, and it is a *surface* in 33 places — the
  // secondary button, your own chat bubbles, the compose bar — each of them with
  // white content on top. Inverting it to near-white (the first thing I tried)
  // makes every one of those white-on-white. Lifting it instead keeps every
  // existing pairing correct and still reads as the most solid thing on the
  // screen, which is what the token means. It is also how a dark-mode secondary
  // button looks anywhere else.
  //
  // The two places it is used as *ink* (community's tab label, the wordmark)
  // are the ones this costs: charcoal text on near-black. Both are one-liners
  // that should be `textPrimary`, and both are in section D of the test sheet.
  accent: '#2A2F3A',
  accentMid: '#39404E',

  // ── Surfaces ─────────────────────────────────────────────────────────────
  // Profile's `container`. Everything else is a lift off this.
  background: '#12151B',
  surface: '#1C2029',
  // Still literal white — the token means the colour, not "the foreground".
  white: '#FFFFFF',

  border: 'rgba(255, 255, 255, 0.12)',
  borderSoft: 'rgba(255, 255, 255, 0.07)',

  // Glass, inverted. Smoked rather than frosted: a translucent *white* pane on a
  // dark backdrop is a grey smear, where a translucent dark one over a lighter
  // blob still reads as a pane with something behind it.
  glassChrome: 'rgba(24, 28, 36, 0.76)',
  glassPanel: 'rgba(30, 35, 44, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.10)',

  // On-photo glass was already dark in the light theme, and a photo is a photo
  // in either — so these barely move.
  glassOnPhoto: 'rgba(9, 12, 20, 0.52)',
  glassBorderOnPhoto: 'rgba(255, 255, 255, 0.18)',

  glassPanelSolid: 'rgba(30, 35, 44, 0.92)',
  glassChromeSolid: 'rgba(24, 28, 36, 0.94)',
  glassOnPhotoSolid: 'rgba(9, 12, 20, 0.66)',

  // Shadows do almost nothing on a dark surface — a black shadow on near-black
  // is invisible. Kept black rather than faked with a glow: the elevation on
  // this theme is carried by the surface lifts above, which is how the profile
  // sheet has always done it.
  shadowWarm: '#000000',

  bgGradientTop: '#151922',
  bgGradientMid: '#12151B',
  bgGradientBottom: '#0E1116',
  bgBlobCool: '#3C4A8C', // the same periwinkle, dimmed to sit under content

  // ── Ink ──────────────────────────────────────────────────────────────────
  // The ramp inverts: on dark, the "ink" you dim and lift with is white.
  ink: '#000000', // shadows only — see shadowWarm
  inkFaint: 'rgba(255, 255, 255, 0.05)',
  inkSubtle: 'rgba(255, 255, 255, 0.09)',
  chipGrab: 'rgba(255, 255, 255, 0.22)',
  chipGrabOnDark: 'rgba(255, 255, 255, 0.30)',
  placeholder: 'rgba(255, 255, 255, 0.38)',
  inkLabel: 'rgba(255, 255, 255, 0.52)',
  // Heavier than the light theme's 45%: a dim over an already-dark screen has
  // to work harder to say "the thing behind this is not the thing to look at".
  scrim: 'rgba(0, 0, 0, 0.62)',
  scrimOnPhoto: 'rgba(9, 12, 20, 0.68)',
  lightbox: 'rgba(0, 0, 0, 0.96)',
  inkVeil: 'rgba(9, 12, 20, 0.32)',

  // ── Text ─────────────────────────────────────────────────────────────────
  // Profile's on-dark ramp, promoted to the whole app.
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.72)',
  textMuted: 'rgba(255, 255, 255, 0.56)',
  textEyebrow: 'rgba(255, 255, 255, 0.48)',

  // Already on-dark tokens: unchanged, because they were built for exactly this
  // surface. Anything using them was dark-mode-correct before there was one.
  textOnDark: 'rgba(255, 255, 255, 0.72)',
  textOnDarkMuted: 'rgba(255, 255, 255, 0.56)',
  fillOnDark: 'rgba(255, 255, 255, 0.08)',
  fillOnDarkStrong: 'rgba(255, 255, 255, 0.16)',
  borderOnDark: 'rgba(255, 255, 255, 0.14)',

  // ── Skeletons ────────────────────────────────────────────────────────────
  // Inverted: the bone is a white lift off the dark surface, matching how this
  // theme carries every other raised surface. The sheen has to be *dimmer* than
  // the light theme's, not brighter — a 45% white band over an 8% white bone is
  // a flash, where on the light theme it is a highlight.
  skeletonBone: 'rgba(255, 255, 255, 0.09)',
  skeletonSheen: 'rgba(255, 255, 255, 0.16)',
  // The same pair for bones on a surface that is dark in *both* themes — the
  // `onPhoto` sheet. Identical in each palette, exactly as `fillOnDark` and
  // `borderOnDark` are, and for the same reason: they were built for a surface
  // that does not change. Without them the locked wishlist's bones would be
  // dark ink on dark glass on the light theme.
  skeletonBoneOnDark: 'rgba(255, 255, 255, 0.09)',
  skeletonSheenOnDark: 'rgba(255, 255, 255, 0.16)',

  // ── Status ───────────────────────────────────────────────────────────────
  // Lifted for contrast against near-black; the tints become washes.
  success: '#34C77B',
  successTint: 'rgba(52, 199, 123, 0.16)',
  attending: '#6BA5FF',
  attendingTint: 'rgba(107, 165, 255, 0.16)',
  verified: '#6B9BFF',
  error: '#FF6B6B',
  errorTint: 'rgba(255, 107, 107, 0.16)',
  warning: '#E2A24C',
  online: '#3ADB7C',
  disabled: 'rgba(255, 255, 255, 0.16)',

  // ── Category accents ─────────────────────────────────────────────────────
  catCoffee: '#E2A24C',
  catDrinks: '#FF6B6B',
  catMusic: '#9B7DF0',
  catTrekking: '#34C77B',
  catGym: '#5B95E8',

  // ── Safety popups ────────────────────────────────────────────────────────
  safetyWomen: '#A98BF5',
  safetyWomenTint: 'rgba(169, 139, 245, 0.18)',
  safetyCaution: '#E2A24C',
  safetyCautionTint: 'rgba(226, 162, 76, 0.18)',
  safetyParty: '#F06BAA',
  safetyPartyTint: 'rgba(240, 107, 170, 0.18)',
};

export type ThemeName = 'light' | 'dark';

export const PALETTES: Record<ThemeName, Palette> = { light: LIGHT, dark: DARK };

// The one piece of mutable state in this file, and the reason `COLORS` can be a
// constant everything imports. `themeStore` owns *when* this changes; nothing
// else should call it.
let active: Palette = LIGHT;
let activeName: ThemeName = 'light';

// Bumped on every change. `themedStyles` compares against it to know whether the
// sheet it cached is still the current one — cheaper than comparing palettes,
// and correct even if a palette object were ever mutated in place.
let generation = 0;

export function applyPalette(name: ThemeName): void {
  if (name === activeName) return;
  activeName = name;
  active = PALETTES[name];
  generation += 1;
}

export function paletteGeneration(): number {
  return generation;
}

export function activePaletteName(): ThemeName {
  return activeName;
}

/**
 * The palette, read live.
 *
 * A Proxy so that the ~1,300 existing `COLORS.x` sites keep working untouched:
 * each one is a property read, and a property read happens when the code runs,
 * not when it was written. Inside a component, a callback or a `themedStyles`
 * factory, "when it runs" is after the theme is known.
 */
export const COLORS: Palette = new Proxy({} as Palette, {
  get: (_target, key: string) => active[key as keyof Palette],
  // Object.keys(COLORS) / spreading has to keep working — `{...COLORS}` snapshots
  // the *current* palette, which is what a caller spreading it wants.
  ownKeys: () => Reflect.ownKeys(active),
  getOwnPropertyDescriptor: (_target, key) =>
    Object.getOwnPropertyDescriptor(active, key),
  has: (_target, key) => key in active,
});

/**
 * A wash of the theme's foreground over its surface.
 *
 * The app writes this by hand ~100 times as `rgba(15, 24, 44, α)` — the ink
 * ramp, at whatever alpha a particular divider or caption wanted. Every one of
 * those is dark-on-light by construction, which on the dark theme is a dark wash
 * over a dark surface: a divider that vanishes, a caption that cannot be read.
 *
 * The named rungs above (`inkFaint`, `inkSubtle`, `placeholder`, `inkLabel`)
 * cover the alphas that were used often enough to name. This covers the rest
 * without inventing a token per alpha: same intent, resolved per theme.
 *
 *   backgroundColor: inkAlpha(0.06)   // was 'rgba(15, 24, 44, 0.06)'
 *
 * Called at render, like everything else that reads the palette, so it follows
 * a theme change on its own.
 */
export function inkAlpha(alpha: number): string {
  return activeName === 'dark'
    ? `rgba(255, 255, 255, ${alpha})`
    : `rgba(15, 24, 44, ${alpha})`;
}
