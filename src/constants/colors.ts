export const COLORS = {
  // Brand
  primary: '#F95B5B',
  primaryLight: '#FF8E8B',
  primaryTint: '#FDECEC',
  primaryDark: '#993232',
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
  placeholder: 'rgba(15, 24, 44, 0.40)', // TextInput placeholderTextColor
  inkLabel: 'rgba(15, 24, 44, 0.50)', // small field labels
  scrim: 'rgba(15, 24, 44, 0.45)', // modal / sheet backdrop
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
  warning: '#C8791E',
  online: '#22C55E',
  disabled: '#D8D5DA',

  // Category accents
  catCoffee: '#C8791E',
  catDrinks: '#F95B5B',
  catMusic: '#6D4AD6',
  catTrekking: '#17915A',
  catGym: '#2A6FDB',
} as const;
