import {
  STACK_DEPTH,
  stackLayer,
  isPastThreshold,
  SWIPE_THRESHOLD_RATIO,
} from '../dealtCardGeometry';

describe('stackLayer', () => {
  it('leaves the top card untransformed and unshaded', () => {
    expect(stackLayer(0)).toEqual({
      x: 0,
      y: 0,
      rotate: 0,
      scale: 1,
      opacity: 1,
      shade: 0,
    });
  });

  // Determinism is the whole point: a random angle re-rolls on every
  // re-render, so a card twitches when something unrelated updates and it
  // reads as a rendering fault.
  it('is deterministic', () => {
    expect(stackLayer(2)).toEqual(stackLayer(2));
    expect(stackLayer(3)).toEqual(stackLayer(3));
  });

  it('throws cards alternately left and right', () => {
    expect(stackLayer(1).x).toBeLessThan(0);
    expect(stackLayer(2).x).toBeGreaterThan(0);
    expect(stackLayer(3).x).toBeLessThan(0);
    expect(stackLayer(4).x).toBeGreaterThan(0);
  });

  it('leans further, drops further and shrinks with depth', () => {
    for (let d = 1; d < STACK_DEPTH; d++) {
      expect(Math.abs(stackLayer(d + 1).rotate)).toBeGreaterThan(
        Math.abs(stackLayer(d).rotate)
      );
      expect(stackLayer(d + 1).y).toBeGreaterThan(stackLayer(d).y);
      expect(stackLayer(d + 1).scale).toBeLessThan(stackLayer(d).scale);
    }
  });

  it('shades everything behind the top card', () => {
    expect(stackLayer(1).shade).toBeGreaterThan(0);
    expect(stackLayer(STACK_DEPTH).shade).toBeGreaterThan(0);
  });

  // Deeper than the stack: parked at the deepest transform, invisible, so a
  // card fades in as the stack shortens rather than popping into existence.
  it('parks anything deeper than the stack at zero opacity', () => {
    const deep = stackLayer(STACK_DEPTH + 3);
    expect(deep.opacity).toBe(0);
    expect(deep.scale).toBe(stackLayer(STACK_DEPTH).scale);
    expect(deep.y).toBe(stackLayer(STACK_DEPTH).y);
  });

  it('clamps a negative depth to the top card', () => {
    expect(stackLayer(-2)).toEqual(stackLayer(0));
  });
});

describe('isPastThreshold', () => {
  const W = 400;

  it('commits past the distance threshold', () => {
    expect(isPastThreshold(W * SWIPE_THRESHOLD_RATIO + 1, 0, W)).toBe(true);
    expect(isPastThreshold(-(W * SWIPE_THRESHOLD_RATIO + 1), 0, W)).toBe(true);
  });

  it('does not commit below it', () => {
    expect(isPastThreshold(20, 0, W)).toBe(false);
  });

  it('commits on a hard flick regardless of distance', () => {
    expect(isPastThreshold(10, 1200, W)).toBe(true);
    expect(isPastThreshold(-10, -1200, W)).toBe(true);
  });
});
