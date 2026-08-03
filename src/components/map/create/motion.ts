// The app's travel motion — see DESIGN.md §8, "The travelling selection".
//
// The tab bar's own GLIDE is damping 19, which is right there because its chip
// only ever moves one narrow tab. A spring's overshoot is a fixed *proportion*
// of the distance travelled, so the same numbers that read as a pleasant
// settle over 60pt read as a lurch over 300 — which is exactly what the
// category row does when it jumps from one end to the other. Damping 24 puts
// the ratio just under critical: it still arrives rather than stops, and the
// overrun stays small enough not to register however far it came.
export const GLIDE = { stiffness: 190, damping: 24, mass: 0.85 } as const;

// How much a travelling indicator compresses on its way.
export const SQUASH = 0.08;

// One tap depth for every control in the create flow. It used to range
// 0.88–0.97 with no pattern, and the deepest ones read as a bounce:
// PressableScale's spring is underdamped, so the release overshoots past 1 in
// proportion to how far the press went down. Shallow dip, small overshoot.
export const TAP_SCALE = 0.96;

// One glyph weight too. Icon defaults to 1.8 and NavButton draws at 2.1, so the
// back arrow came out heavier than everything beside it. 2.1 is the nav weight
// and the one that reads correctly at this size, so the rest match it.
export const GLYPH_STROKE = 2.1;
