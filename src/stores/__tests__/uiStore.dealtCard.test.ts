import { useUIStore } from '../uiStore';

const ORIGIN = { x: 100, y: 200, width: 34, height: 34 };

function reset() {
  useUIStore.getState().closeDealtCard();
}

describe('uiStore dealt card', () => {
  beforeEach(reset);

  it('opens a deck at the given index with its origin', () => {
    useUIStore.getState().dealCard(['a', 'b', 'c'], 0, ORIGIN);
    expect(useUIStore.getState().dealtCard).toEqual({
      ids: ['a', 'b', 'c'],
      index: 0,
      origin: ORIGIN,
      source: 'browse',
    });
  });

  // The origin belongs to the FIRST card only. Once you have swiped, the
  // element the current card came from is no longer on screen, so dismiss must
  // not fly back to it.
  it('drops the origin on the first advance', () => {
    useUIStore.getState().dealCard(['a', 'b', 'c'], 0, ORIGIN);
    useUIStore.getState().advanceDealtCard();
    expect(useUIStore.getState().dealtCard).toEqual({
      ids: ['a', 'b', 'c'],
      index: 1,
      origin: null,
      source: 'browse',
    });
  });

  // `source` says what a swipe on the card should DO (generic advance/save vs
  // the swipe deck's real quota-spending swipe()) — every opener except the
  // swipe deck screen omits it and gets 'browse' for free.
  it('defaults source to browse when not given', () => {
    useUIStore.getState().dealCard(['a'], 0, null);
    expect(useUIStore.getState().dealtCard?.source).toBe('browse');
  });

  it('records an explicit source', () => {
    useUIStore.getState().dealCard(['a', 'b'], 0, ORIGIN, 'swipeDeck');
    expect(useUIStore.getState().dealtCard?.source).toBe('swipeDeck');
  });

  // Unlike origin, source is not tied to the first card — the swipe deck
  // screen dealt the whole deck, and every card in it should still delegate to
  // its swipe() after advancing.
  it('source survives advanceDealtCard, unlike origin', () => {
    useUIStore.getState().dealCard(['a', 'b', 'c'], 0, ORIGIN, 'swipeDeck');
    useUIStore.getState().advanceDealtCard();
    expect(useUIStore.getState().dealtCard).toEqual({
      ids: ['a', 'b', 'c'],
      index: 1,
      origin: null,
      source: 'swipeDeck',
    });
  });

  it('closes when the last card is advanced past', () => {
    useUIStore.getState().dealCard(['a', 'b'], 0, ORIGIN);
    useUIStore.getState().advanceDealtCard();
    useUIStore.getState().advanceDealtCard();
    expect(useUIStore.getState().dealtCard).toBeNull();
  });

  it('advancing with nothing open is a no-op', () => {
    useUIStore.getState().advanceDealtCard();
    expect(useUIStore.getState().dealtCard).toBeNull();
  });

  it('can open partway into a deck', () => {
    useUIStore.getState().dealCard(['a', 'b', 'c'], 2, null);
    expect(useUIStore.getState().dealtCard?.index).toBe(2);
  });
});
