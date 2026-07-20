import { COLORS } from './colors';

// Spacing scale, keyed in 4px units — SPACING[2] is 8px, SPACING[0.5] is 2px.
//
// The previous version was xs/sm/md/lg/xl on a strict 4px grid and could
// express only 36% of the spacing values the app actually uses. It had no way
// to say 10px (123 uses) or 14px (92), two of the four most common values in
// the codebase, so anyone reaching for it had to bail out immediately — which
// is why, like the type and radius scales, it had zero importers.
//
// Half-steps exist because this is a dense mobile UI: 6px and 10px gaps inside
// chips and meta rows are real, not sloppiness. The scale describes the app.
//
// Use these in new code. Do NOT codemod existing screens onto them — 1139 call
// sites is a design review, not a refactor. See CLEANUP.md.
export const SPACING = {
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
} as const;

// Corner radii, derived from what the app actually renders rather than from a
// tidy doubling sequence. The previous version had 8/12/16/24/100 and could not
// express 14 or 18 — respectively the second and fourth most common radii in
// the codebase — which is a large part of why it had zero importers.
//
// `full` is for pills. Circles are NOT on this scale: a circle's radius is
// half its own width (borderRadius 48 on a 96px tile), which is geometry, not a
// corner style — snapping those to a step turns circles into rounded squares.
// Any radius above '3xl' in the codebase is deliberately left as a raw number.
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
