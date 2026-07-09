export const FONTS = {
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  heavy: 'PlusJakartaSans_800ExtraBold',
} as const;

// React Native style objects for each scale step.
// Use these anywhere you'd write fontSize/fontWeight inline.
export const TYPE = {
  display: { fontFamily: FONTS.heavy, fontSize: 48, lineHeight: 52, letterSpacing: -0.48 },
  h1:      { fontFamily: FONTS.bold,    fontSize: 32, lineHeight: 38, letterSpacing: -0.32 },
  h2:      { fontFamily: FONTS.bold,    fontSize: 26, lineHeight: 32 },
  title:   { fontFamily: FONTS.bold,    fontSize: 22, lineHeight: 28 },
  subtitle:{ fontFamily: FONTS.semibold, fontSize: 17, lineHeight: 22 },
  bodyLg:  { fontFamily: FONTS.medium,  fontSize: 16, lineHeight: 22 },
  body:    { fontFamily: FONTS.medium,  fontSize: 15, lineHeight: 20 },
  bodySm:  { fontFamily: FONTS.medium,  fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: FONTS.semibold, fontSize: 12, lineHeight: 16 },
  overline:{ fontFamily: FONTS.bold,    fontSize: 11, lineHeight: 14, letterSpacing: 1.98, textTransform: 'uppercase' as const },
} as const;
