export const FONTS = {
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  heavy: 'PlusJakartaSans_800ExtraBold',
  // Display / headings — Bricolage Grotesque (locked design language).
  heading: 'BricolageGrotesque_800ExtraBold',
  headingBold: 'BricolageGrotesque_700Bold',
} as const;

// The type scale. Nine steps, whole pixels, named by the job the text does and
// never by its size. That naming is the point: it lets a value change here
// without touching a call site.
//
// The values are deliberately conservative. The app renders 34 distinct font
// sizes today, 35% of them half-points, and there is no latent role structure
// to recover — sizes were picked per screen, not per role. Snapping all 555
// call sites onto a scale would move over half the text in the app, which is a
// typographic redesign that needs a designer looking at screens, not a codemod.
//
// So this is adopted in src/components/ui/ only: the primitives every screen is
// meant to build from. New components inherit it for free, and the
// screen-by-screen migration can follow later as a design review. Adopting it
// moved no existing text by more than half a pixel.
//
// The previous version of this scale had eleven steps and zero importers, and
// its values (22 title, 26 h2, 38 display) matched nothing the app actually
// rendered — which is why nobody ever adopted it.
export const TYPE = {
  display: {
    fontFamily: FONTS.heading,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1,
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.4,
  },
  section: {
    fontFamily: FONTS.heavy,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  // Large button labels and prominent body copy.
  bodyLg: { fontFamily: FONTS.heading, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: FONTS.medium, fontSize: 15, lineHeight: 20 },
  bodySm: { fontFamily: FONTS.medium, fontSize: 13, lineHeight: 18 },
  // Meta rows, chips, counters.
  caption: { fontFamily: FONTS.semibold, fontSize: 12, lineHeight: 16 },
  // Field labels and the dense small type the app leans on heavily.
  micro: { fontFamily: FONTS.bold, fontSize: 11, lineHeight: 14 },
  // Avatar overflow counts and character counters. Smallest legible step.
  nano: { fontFamily: FONTS.bold, fontSize: 10, lineHeight: 12 },
} as const;

// Sizes only, for the places that pick their own family or weight — Button
// chooses a family by size, badges invert their colour — and need just the step.
export const TYPE_SIZE = {
  display: TYPE.display.fontSize,
  title: TYPE.title.fontSize,
  section: TYPE.section.fontSize,
  bodyLg: TYPE.bodyLg.fontSize,
  body: TYPE.body.fontSize,
  bodySm: TYPE.bodySm.fontSize,
  caption: TYPE.caption.fontSize,
  micro: TYPE.micro.fontSize,
  nano: TYPE.nano.fontSize,
} as const;
