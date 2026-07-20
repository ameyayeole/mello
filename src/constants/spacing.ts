import { COLORS } from './colors';

// Spacing scale. The app's padding/margin/gap numbers peak on these values,
// with a long tail (10/13/15/22/30) that has never been normalised — see
// CLEANUP.md. Use these in new code; do not mass-migrate existing screens
// without a design pass.
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

// Corner radii, derived from what the app actually renders rather than from a
// tidy doubling sequence. The previous version had 8/12/16/24/100 and could not
// express 14 or 18 — respectively the second and fourth most common radii in
// the codebase — which is a large part of why it had zero importers.
//
// `full` is for circles and the few genuinely round elements. It is not for
// buttons: the app has no pill buttons, deliberately.
export const RADIUS = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  full: 100,
} as const;

// Elevation. `shadowColor` is a real colour token, not a hex literal — the
// primary shadow previously used #FF5E5B, a third rival coral that matched
// neither COLORS.primary nor anything else in the palette.
export const SHADOWS = {
  sm: {
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  // The coral glow under a primary button.
  primary: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
} as const;
