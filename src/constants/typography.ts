export const FONTS = {
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  heavy: 'PlusJakartaSans_800ExtraBold',
  // Display / headings — Bricolage Grotesque (locked design language).
  heading: 'BricolageGrotesque_800ExtraBold',
  headingBold: 'BricolageGrotesque_700Bold',
} as const;

// The type scale — whole pixels, named by the job the text does, never by its
// size. That naming is the point: it lets a value change here
// without touching a call site.
//
// Thirteen steps: 10 11 12 13 14 15 16 17 18 20 24 28 34. The whole app is
// migrated onto them, so the scale has to span its real range — an earlier
// nine-step version stopped at 20 below display and would have collapsed every
// heading in the app onto it.
//
// The version before that had eleven steps and zero importers, with values
// (22 title, 26 h2, 38 display) matching nothing the app rendered. That is the
// recurring failure: a scale written as an ideal rather than derived from the
// code is one the first person to reach for it bounces off.
export const TYPE = {
  h1: {
    fontFamily: FONTS.heading,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.8,
  },
  titleLg: {
    fontFamily: FONTS.heading,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  sectionLg: {
    fontFamily: FONTS.heavy,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  bodyMd: { fontFamily: FONTS.medium, fontSize: 14, lineHeight: 19 },
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
  h1: TYPE.h1.fontSize,
  titleLg: TYPE.titleLg.fontSize,
  sectionLg: TYPE.sectionLg.fontSize,
  bodyMd: TYPE.bodyMd.fontSize,
  title: TYPE.title.fontSize,
  section: TYPE.section.fontSize,
  bodyLg: TYPE.bodyLg.fontSize,
  body: TYPE.body.fontSize,
  bodySm: TYPE.bodySm.fontSize,
  caption: TYPE.caption.fontSize,
  micro: TYPE.micro.fontSize,
  nano: TYPE.nano.fontSize,
} as const;
