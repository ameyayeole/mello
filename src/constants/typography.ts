export const FONTS = {
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  heavy: 'PlusJakartaSans_800ExtraBold',
  // Display / headings — Bricolage Grotesque (locked design language).
  heading: 'BricolageGrotesque_800ExtraBold',
  headingBold: 'BricolageGrotesque_700Bold',
} as const;

// React Native style objects for each scale step.
// Use these anywhere you'd write fontSize/fontWeight inline.
// Big headings use Bricolage Grotesque; body/labels use Plus Jakarta Sans.
export const TYPE = {
  display: { fontFamily: FONTS.heading, fontSize: 38, lineHeight: 40, letterSpacing: -1.5 },
  h1:      { fontFamily: FONTS.heading, fontSize: 28, lineHeight: 30, letterSpacing: -0.8 },
  h2:      { fontFamily: FONTS.heading, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  title:   { fontFamily: FONTS.heading, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  section: { fontFamily: FONTS.heading, fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  subtitle:{ fontFamily: FONTS.semibold, fontSize: 17, lineHeight: 22 },
  bodyLg:  { fontFamily: FONTS.medium,  fontSize: 16, lineHeight: 22 },
  body:    { fontFamily: FONTS.medium,  fontSize: 15, lineHeight: 20 },
  bodySm:  { fontFamily: FONTS.medium,  fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: FONTS.semibold, fontSize: 12, lineHeight: 16 },
  overline:{ fontFamily: FONTS.bold,    fontSize: 11, lineHeight: 14, letterSpacing: 1.98, textTransform: 'uppercase' as const },
} as const;
