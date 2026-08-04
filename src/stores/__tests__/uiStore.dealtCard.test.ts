import * as Haptics from 'expo-haptics';
import { useUIStore } from '../uiStore';

// `dealCard` fires the design doc's touch-down haptic (§3) itself, from the
// one place every opener — fifteen call sites across ten files — already goes
// through, rather than each call site firing it. Mocked explicitly rather than
// relying on jest-expo's native-module stubbing to merely not throw: this
// asserts the call actually happens, not just that nothing blows up when it's
// missing.
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

// Six of the tests that were here drove `advanceDealtCard` — stepping an index
// through a deck of ids. That action, and the `ids`/`index` pair it stepped,
// are gone: the pin's card deals ONE event and the many-deep stack is
// `EventDeck`. They were the action's only remaining callers, which is what
// made it safe to delete rather than a reason to keep it.
describe('uiStore dealt card', () => {
  beforeEach(reset);

  // Covers every opener from one assertion, since they all funnel through
  // this same action — including the deep-link path, which has no touch to
  // fire a haptic from at all; a selection tick with nothing pressed is
  // harmless, so it isn't special-cased.
  it('fires the touch-down selection haptic on deal', () => {
    useUIStore.getState().dealCard('a', ORIGIN);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('opens one event with its origin', () => {
    useUIStore.getState().dealCard('a', ORIGIN);
    expect(useUIStore.getState().dealtCard).toEqual({
      id: 'a',
      origin: ORIGIN,
      token: expect.any(Number),
    });
  });

  // A deep link and a notification tapped from a pushed route both deal with
  // nothing on screen to fly from. That is a real state, not a missing one.
  it('opens with no origin at all', () => {
    useUIStore.getState().dealCard('a', null);
    expect(useUIStore.getState().dealtCard?.origin).toBeNull();
  });

  // `EventDealtCard` keys the card on this. Replacing a card in place — the
  // back face's "Happening near you" rail deals a new one while a card is
  // already open — otherwise reused the mounted component, whose deal effect
  // is mount-only and whose flip nothing reset: the new event appeared with no
  // deal animation, already showing its back.
  it('gives every deal a fresh token', () => {
    useUIStore.getState().dealCard('a', ORIGIN);
    const first = useUIStore.getState().dealtCard!.token;
    useUIStore.getState().dealCard('b', null);
    expect(useUIStore.getState().dealtCard!.token).not.toBe(first);
  });

  // A monotonic counter rather than a timestamp, because dealing twice inside
  // one millisecond is exactly the case the token exists for.
  it('gives a fresh token even when the same event is re-dealt', () => {
    useUIStore.getState().dealCard('a', ORIGIN);
    const first = useUIStore.getState().dealtCard!.token;
    useUIStore.getState().dealCard('a', ORIGIN);
    expect(useUIStore.getState().dealtCard!.token).not.toBe(first);
  });

  it('closes', () => {
    useUIStore.getState().dealCard('a', ORIGIN);
    useUIStore.getState().closeDealtCard();
    expect(useUIStore.getState().dealtCard).toBeNull();
  });
});
