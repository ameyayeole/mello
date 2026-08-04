import * as Haptics from 'expo-haptics';

// What `DealtCard` (the map pin's card) and `EventDeck` (the swipe deck) have
// to agree on: the geometry of the stack, the swipe threshold, the shared
// constants and the haptic vocabulary.
//
// No React and no Reanimated — so the numbers that decide how the thing looks
// can actually be tested, which nothing else about this feature can be
// (Reanimated 4 throws on import under Jest). `expo-haptics` is the one native
// import, and only for `haptic()` below; it is mocked by `jest-expo` and the
// pure tests here and in `deckSlots.test.ts` run against it unchanged.
//
// The two components are deliberately NOT merged — they are different
// surfaces with different gestures, and the design doc argues that at length.
// This module is the seam where they must not drift instead. Everything here
// was previously copied into both, including a `DIM_OPACITY` whose comment
// asked the reader to remember to keep the copies in sync; that is the failure
// mode `AGENTS.md`'s query-key rule exists to prevent, and it applies to a
// number as much as to a cache key.

// How many cards are drawn behind the top one. Anything deeper is parked at
// the deepest transform with zero opacity, so it fades in as the stack
// shortens instead of appearing from nothing.
export const STACK_DEPTH = 4;

// How dark the world goes behind a dealt card or the open deck. Raised from
// 0.8 originally: at that level the map behind stayed legible enough to
// compete, and the card is meant to be the only thing you are looking at. Both
// surfaces dim to the same level on purpose.
export const DIM_OPACITY = 0.9;

// How far a finger may travel and still count as a tap-to-flip. Matches the
// slop RN's own Pressable allows before it cancels a press, so the two agree
// on where a tap stops being a tap.
export const TAP_SLOP = 10;

// A card's resting shadow. Both surfaces animate it through the flip (a 3D
// rotation foreshortens the card without narrowing the rectangle its shadow is
// drawn from), which is why it is named rather than inline.
export const CARD_SHADOW_OPACITY = 0.42;
// Android draws no shadow from `shadowOpacity`; `elevation` is its knob.
export const CARD_ELEVATION = 18;

// The swipe deck's own threshold, carried over when that screen was folded
// into this card. Horizontal means the same thing on every card in the app;
// two thresholds would be two different feels for one gesture.
export const SWIPE_THRESHOLD_RATIO = 0.28;
export const SWIPE_VELOCITY = 900;

// One card's own travel, fan to centre. The deck's sense of pace comes from the
// beat between cards (see DEAL_STAGGER_MS), not from any one of them being
// slow.
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
  // Same reason as `isPastThreshold` below: read from `CardLayer`'s animated
  // styles, which are worklets.
  'worklet';
  if (depth <= 0) return LAYERS[0];
  if (depth <= STACK_DEPTH) return LAYERS[depth];
  return { ...LAYERS[STACK_DEPTH], opacity: 0 };
}

/**
 * Every haptic either surface fires, in one vocabulary.
 *
 * The two callers overlap on four of the six and agreed on all four when they
 * were separate copies — this pins that agreement rather than relying on it.
 * The two that don't overlap are each one surface's way in: `expand` is the
 * deck growing out of its parked corner, `settle` is a dealt card coming to
 * rest.
 *
 * `save` is the only success notification, and only on a save: a pass is not a
 * success, and the `threshold` tick has already said the swipe took.
 */
export type DealtCardHaptic =
  | 'expand'
  | 'land'
  | 'settle'
  | 'flip'
  | 'threshold'
  | 'save';

export function haptic(kind: DealtCardHaptic) {
  if (kind === 'expand' || kind === 'threshold') Haptics.selectionAsync();
  else if (kind === 'land') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  else if (kind === 'settle' || kind === 'flip')
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

// Distance OR velocity, same as the swipe deck: a hard flick commits without
// travelling the full threshold.
export function isPastThreshold(
  dx: number,
  velocityX: number,
  width: number
): boolean {
  // Called from inside the pan gesture's worklets, which run on the UI thread.
  // Without this directive Reanimated throws "Tried to synchronously call a
  // non-worklet function on the UI thread" the first time a finger moves on a
  // card — and nothing catches it: the function is pure, its unit tests pass,
  // and `tsc` sees nothing wrong. Only a device does.
  'worklet';
  return (
    Math.abs(dx) > width * SWIPE_THRESHOLD_RATIO ||
    Math.abs(velocityX) > SWIPE_VELOCITY
  );
}
