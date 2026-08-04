import {
  miniSlot,
  expandedSlot,
  deckVisible,
  MINI_W,
} from '../deckSlots';
import { STACK_DEPTH, stackLayer } from '@/components/ui/dealtCardGeometry';

const CARD_W = 300;
const CARD_H = 465;

describe('miniSlot', () => {
  it('scales a full card down to the fan mini', () => {
    expect(miniSlot(0, CARD_W, CARD_H).scale).toBeCloseTo(MINI_W / CARD_W, 5);
  });

  // The fan reads as a hand of cards because they lean different ways. A
  // uniform tilt would be a neat pile, which is not the same object.
  it('fans the cards at different angles', () => {
    const a = miniSlot(0, CARD_W, CARD_H).rotate;
    const b = miniSlot(1, CARD_W, CARD_H).rotate;
    const c = miniSlot(2, CARD_W, CARD_H).rotate;
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('leans the front card the opposite way to the ones behind it', () => {
    expect(miniSlot(0, CARD_W, CARD_H).rotate).toBeGreaterThan(0);
    expect(miniSlot(1, CARD_W, CARD_H).rotate).toBeLessThan(0);
    expect(miniSlot(2, CARD_W, CARD_H).rotate).toBeLessThan(0);
  });

  // Anything past the three the fan shows sits exactly under the third, so a
  // deep deck does not spray cards across the corner of the map.
  it('parks anything deeper than the fan under the last visible mini', () => {
    expect(miniSlot(5, CARD_W, CARD_H)).toEqual(miniSlot(2, CARD_W, CARD_H));
  });

  it('is deterministic', () => {
    expect(miniSlot(1, CARD_W, CARD_H)).toEqual(miniSlot(1, CARD_W, CARD_H));
  });
});

describe('expandedSlot', () => {
  it('is the messy stack the dealt card already uses', () => {
    for (let d = 0; d <= STACK_DEPTH; d++) {
      const slot = expandedSlot(d);
      const layer = stackLayer(d);
      expect(slot.x).toBe(layer.x);
      expect(slot.y).toBe(layer.y);
      expect(slot.rotate).toBe(layer.rotate);
      expect(slot.scale).toBe(layer.scale);
    }
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
