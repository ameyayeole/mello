// The travelling selection's motion now lives in @/constants/motion, because
// the profile editor's gender picker uses the same movement and two copies of
// the numbers would drift. Re-exported here so this flow's existing imports
// keep working unchanged.
export { GLIDE, SQUASH } from '@/constants/motion';

// One tap depth for every control in the create flow. It used to range
// 0.88–0.97 with no pattern, and the deepest ones read as a bounce:
// PressableScale's spring is underdamped, so the release overshoots past 1 in
// proportion to how far the press went down. Shallow dip, small overshoot.
export const TAP_SCALE = 0.96;

// One glyph weight too. Icon defaults to 1.8 and NavButton draws at 2.1, so the
// back arrow came out heavier than everything beside it. 2.1 is the nav weight
// and the one that reads correctly at this size, so the rest match it.
export const GLYPH_STROKE = 2.1;
