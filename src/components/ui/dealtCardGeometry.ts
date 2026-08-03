// Pure geometry for the dealt card and the deck behind it. No React, no
// Reanimated — so the numbers that decide how the thing looks can actually be
// tested, which nothing else about this feature can be (Reanimated 4 throws on
// import under Jest).

// How many cards are drawn behind the top one. Anything deeper is parked at
// the deepest transform with zero opacity, so it fades in as the stack
// shortens instead of appearing from nothing.
export const STACK_DEPTH = 4;

// Matches app/events/swipe.tsx exactly. Horizontal means the same thing on
// this card as it does on every other card in the app; two thresholds would be
// two different feels for one gesture.
export const SWIPE_THRESHOLD_RATIO = 0.28;
export const SWIPE_VELOCITY = 900;

export const DEAL_MS = 620;
export const DISMISS_MS = 380;
export const FLIP_MS = 460;
// Promoting the next card up one depth after a swipe. Not a deal — the card is
// already on screen.
export const PROMOTE_MS = 460;

export interface StackLayer {
  x: number;
  y: number;
  // degrees
  rotate: number;
  scale: number;
  opacity: number;
  // Opacity of the dark overlay laid over this card. React Native has no CSS
  // `filter`, so the "dimmer the further back" effect is a real View on top of
  // each card rather than a brightness filter.
  shade: number;
}

// The mess is a fixed table, not `Math.random()`. A random angle re-rolls on
// every re-render, so a card visibly twitches whenever something unrelated
// updates — and that reads as a rendering fault, not as charm. Nothing in the
// test suite or in `tsc` could catch it.
//
// Alternating sign is what makes it read as a hand someone put down rather
// than a fanned deck.
const LAYERS: readonly StackLayer[] = [
  { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, shade: 0 },
  { x: -6.8, y: 5, rotate: -4, scale: 0.96, opacity: 1, shade: 0.18 },
  { x: 8.8, y: 10, rotate: 5.25, scale: 0.92, opacity: 1, shade: 0.18 },
  { x: -10.8, y: 15, rotate: -6.5, scale: 0.88, opacity: 1, shade: 0.18 },
  { x: 12.8, y: 20, rotate: 7.75, scale: 0.84, opacity: 1, shade: 0.18 },
];

export function stackLayer(depth: number): StackLayer {
  if (depth <= 0) return LAYERS[0];
  if (depth <= STACK_DEPTH) return LAYERS[depth];
  return { ...LAYERS[STACK_DEPTH], opacity: 0 };
}

// Distance OR velocity, same as the swipe deck: a hard flick commits without
// travelling the full threshold.
export function isPastThreshold(
  dx: number,
  velocityX: number,
  width: number
): boolean {
  return (
    Math.abs(dx) > width * SWIPE_THRESHOLD_RATIO ||
    Math.abs(velocityX) > SWIPE_VELOCITY
  );
}
