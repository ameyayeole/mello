import * as Haptics from 'expo-haptics';
import { useUIStore } from '../uiStore';

// `dealCard` fires the design doc's touch-down haptic (§3) itself, from the
// one place every opener — twelve of them — already goes through, rather
// than each call site firing it. Mocked explicitly rather than relying on
// jest-expo's native-module stubbing to merely not throw: this asserts the
// call actually happens, not just that nothing blows up when it's missing.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

const ORIGIN = { x: 100, y: 200, width: 34, height: 34 };

function reset() {
  useUIStore.getState().closeDealtCard();
  jest.clearAllMocks();
}

describe('uiStore dealt card', () => {
  beforeEach(reset);

  // Covers every opener from one assertion, since they all funnel through
  // this same action — including the deep-link path, which has no touch to
  // fire a haptic from at all; a selection tick with nothing pressed is
  // harmless, so it isn't special-cased.
  it('fires the touch-down selection haptic on deal', () => {
    useUIStore.getState().dealCard(['a', 'b'], 0, ORIGIN);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('does not fire the haptic again on advance', () => {
    useUIStore.getState().dealCard(['a', 'b'], 0, ORIGIN);
    jest.clearAllMocks();
    useUIStore.getState().advanceDealtCard();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('opens a deck at the given index with its origin', () => {
    useUIStore.getState().dealCard(['a', 'b', 'c'], 0, ORIGIN);
    expect(useUIStore.getState().dealtCard).toEqual({
      ids: ['a', 'b', 'c'],
      index: 0,
      origin: ORIGIN,
      token: expect.any(Number),
    });
  });

  // `EventDealtCard` keys the card on this. Replacing a deck in place — the
  // back face's "Happening near you" rail deals a new one while a card is
  // already open — otherwise reused the mounted component, whose deal effect
  // is mount-only and whose flip nothing reset: the new event appeared with no
  // deal animation, already showing its back.
  it('gives every deal a fresh token', () => {
    useUIStore.getState().dealCard(['a'], 0, ORIGIN);
    const first = useUIStore.getState().dealtCard!.token;
    useUIStore.getState().dealCard(['b'], 0, null);
    expect(useUIStore.getState().dealtCard!.token).not.toBe(first);
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
      token: expect.any(Number),
    });
  });

  // Unlike origin, the deal token is not tied to the first card: it keys the
  // mounted card, and an advance is a depth promotion — remounting on it would
  // throw away the very animation the promotion exists for.
  it('the deal token survives advanceDealtCard, unlike origin', () => {
    useUIStore.getState().dealCard(['a', 'b', 'c'], 0, ORIGIN);
    const { token } = useUIStore.getState().dealtCard!;
    useUIStore.getState().advanceDealtCard();
    expect(useUIStore.getState().dealtCard).toEqual({
      ids: ['a', 'b', 'c'],
      index: 1,
      origin: null,
      token,
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
