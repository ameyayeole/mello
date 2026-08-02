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
