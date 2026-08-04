import {
  miniSlot,
  expandedSlot,
  deckVisible,
  MINI_W,
} from '../deckSlots';
import { STACK_DEPTH, stackLayer } from '@/components/ui/dealtCardGeometry';

const CARD_W = 300;

describe('miniSlot', () => {
  it('scales a full card down to the fan mini', () => {
    expect(miniSlot(0, CARD_W).scale).toBeCloseTo(MINI_W / CARD_W, 5);
  });

  // The fan reads as a hand of cards because they lean different ways. A
  // uniform tilt would be a neat pile, which is not the same object.
  it('fans the cards at different angles', () => {
    const a = miniSlot(0, CARD_W).rotate;
    const b = miniSlot(1, CARD_W).rotate;
    const c = miniSlot(2, CARD_W).rotate;
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('leans the front card the opposite way to the ones behind it', () => {
    expect(miniSlot(0, CARD_W).rotate).toBeGreaterThan(0);
    expect(miniSlot(1, CARD_W).rotate).toBeLessThan(0);
    expect(miniSlot(2, CARD_W).rotate).toBeLessThan(0);
  });

  // Anything past the three the fan shows sits exactly under the third, so a
  // deep deck does not spray cards across the corner of the map.
  it('parks anything deeper than the fan under the last visible mini', () => {
    expect(miniSlot(5, CARD_W)).toEqual(miniSlot(2, CARD_W));
  });

  it('is deterministic', () => {
    expect(miniSlot(1, CARD_W)).toEqual(miniSlot(1, CARD_W));
  });

  // The parked fan has no stack to shade — the cards are thumbnails behind
  // each other, not a dimmed pile.
  it('never shades a parked card', () => {
    for (let d = 0; d <= 5; d++) expect(miniSlot(d, CARD_W).shade).toBe(0);
  });
});

describe('expandedSlot', () => {
  // Past STACK_DEPTH, not up to it. `stackLayer`'s opacity-0 branch only fires
  // at `depth > STACK_DEPTH`, and that is exactly the layer `EventDeck`
  // renders — it slices the deck to `STACK_DEPTH + 2`, so the deepest card it
  // mounts is at depth STACK_DEPTH + 1 and is meant to be invisible until the
  // stack shortens. Looping only to STACK_DEPTH left that branch untested.
  it('is the messy stack the dealt card already uses, at every depth it renders', () => {
    for (let d = 0; d <= STACK_DEPTH + 2; d++) {
      expect(expandedSlot(d)).toEqual(stackLayer(d));
    }
  });

  // Named separately from the loop above because it is the one this file
  // exists to pin: `expandedSlot` used to list `stackLayer`'s fields by hand
  // and silently dropped `shade`, and `EventDeck` then re-typed it as a
  // literal that happened to agree.
  it('carries the shade through rather than dropping it', () => {
    expect(expandedSlot(0).shade).toBe(stackLayer(0).shade);
    expect(expandedSlot(1).shade).toBe(stackLayer(1).shade);
    expect(expandedSlot(1).shade).toBeGreaterThan(0);
  });

  it('fades out the layer past the deepest one the stack draws', () => {
    expect(expandedSlot(STACK_DEPTH).opacity).toBe(1);
    expect(expandedSlot(STACK_DEPTH + 1).opacity).toBe(0);
  });
});

describe('deckVisible', () => {
  const base = {
    onMap: true,
    creatingEvent: false,
    overlayOpen: false,
    expanded: false,
  };

  it('shows the parked fan on the map', () => {
    expect(deckVisible(base)).toBe(true);
  });

  it('hides the parked fan off the map', () => {
    expect(deckVisible({ ...base, onMap: false })).toBe(false);
  });

  // The portal is mounted for as long as this is visible, and it paints over
  // everything — so the fan must get out of the way of anything that takes the
  // screen. Nothing in tsc or the tests can catch this being wrong in the app;
  // this test is the only thing pinning it.
  it('hides the parked fan while creating an event', () => {
    expect(deckVisible({ ...base, creatingEvent: true })).toBe(false);
  });

  it('hides the parked fan under a full-screen overlay', () => {
    expect(deckVisible({ ...base, overlayOpen: true })).toBe(false);
  });

  // Expanded is the top thing on screen by definition — it does not matter
  // what route you were on when it opened.
  it('shows when expanded regardless of everything else', () => {
    expect(
      deckVisible({
        onMap: false,
        creatingEvent: true,
        overlayOpen: true,
        expanded: true,
      })
    ).toBe(true);
  });
});
