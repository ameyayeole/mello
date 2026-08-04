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
  // Opacity of the dark overlay laid over this card — React Native has no CSS
  // `filter`, so "dimmer the further back" is a real View. Carried through from
  // `StackLayer` rather than dropped: `EventDeck` used to re-type it as the
  // literal 0.18, which happened to match `LAYERS[1..4].shade` and would have
  // gone on matching silently after someone tuned one and not the other.
  shade: number;
}

// The fan's own width. MINI_H and FAN_H used to be here too and were read by
// nothing — and misdescribed the result besides: `miniSlot` scales by WIDTH
// and the card's aspect is fixed, so the parked card is 82 × (82 * CARD_ASPECT)
// ≈ 82×127, not the 82×110 the deleted constant claimed. `EventDeck` computes
// the real height from the card's own aspect (`miniCardH`) for exactly that
// reason.
export const MINI_W = 82;
export const FAN_W = 116;

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
 *
 * Takes the card's WIDTH only. There used to be a third `_cardH` parameter,
 * unused and underscore-prefixed, that callers and the test both passed a real
 * value to — which read as though height mattered here. It does not: the
 * card's aspect is fixed, so scaling by width sets the height too.
 */
export function miniSlot(depth: number, cardW: number): DeckSlot {
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
    // The parked fan has no stack to shade — its cards are simply behind each
    // other, at the size of a thumbnail. `EventDeck` multiplies the shade by
    // `expand` as well, so this is belt-and-braces rather than the only guard.
    shade: 0,
  };
}

/**
 * A card's slot when the deck is open — the same messy stack a dealt card uses.
 *
 * Every field is delegated, `shade` included. Spreading `stackLayer` rather
 * than listing the fields, so a field added there cannot be silently dropped
 * here the way `shade` was.
 */
export function expandedSlot(depth: number): DeckSlot {
  'worklet';
  return { ...stackLayer(depth) };
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
