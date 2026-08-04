import { stackLayer } from '@/components/ui/dealtCardGeometry';

// Where a card sits in the corner of the map, and where it sits when the deck
// is open. No React and no Reanimated, so the numbers that decide how this
// looks can be tested — which nothing else about it can be.

export interface DeckSlot {
  x: number;
  y: number;
  // degrees
  rotate: number;
  scale: number;
  opacity: number;
}

// The fan's own dimensions, carried over from SwipeDeckTeaser.
export const MINI_W = 82;
export const MINI_H = 110;
export const FAN_W = 116;
export const FAN_H = 138;

// Front card leans one way, the two behind fan away the other — a hand of
// cards peeking out of a pocket rather than a tidy pile.
const FAN = [
  { x: 12, y: 0, rotate: 5 },
  { x: 0, y: 3, rotate: -7 },
  { x: -12, y: 8, rotate: -19 },
] as const;

/**
 * A card's slot in the parked fan, expressed relative to the card's own full
 * size — so the same element that fills the screen when open can sit in the
 * corner without ever being re-rendered at a different size.
 */
export function miniSlot(depth: number, cardW: number, _cardH: number): DeckSlot {
  'worklet';
  // Anything past the three the fan shows sits under the third: a deep deck
  // must not spray cards across the corner of the map.
  const f = FAN[Math.min(Math.max(depth, 0), FAN.length - 1)];
  return {
    x: f.x,
    y: f.y,
    rotate: f.rotate,
    // Width drives the scale; the card's aspect is fixed, so height follows.
    scale: MINI_W / cardW,
    opacity: 1,
  };
}

/** A card's slot when the deck is open — the same messy stack a dealt card uses. */
export function expandedSlot(depth: number): DeckSlot {
  'worklet';
  const l = stackLayer(depth);
  return { x: l.x, y: l.y, rotate: l.rotate, scale: l.scale, opacity: l.opacity };
}

/**
 * Whether the deck renders at all.
 *
 * This is a rule rather than an accident because of where the deck lives. It
 * sits in the root portal, and on iOS that overlay attaches to the key window
 * when it mounts — so for as long as the parked fan is visible, an overlay is
 * mounted over the whole app. It therefore has to get out of the way of
 * anything that takes the screen, or it floats above the create-event flow.
 *
 * Expanded ignores all of it: the open deck IS the top thing on screen.
 */
export function deckVisible({
  onMap,
  creatingEvent,
  overlayOpen,
  expanded,
}: {
  onMap: boolean;
  creatingEvent: boolean;
  overlayOpen: boolean;
  expanded: boolean;
}): boolean {
  if (expanded) return true;
  return onMap && !creatingEvent && !overlayOpen;
}
