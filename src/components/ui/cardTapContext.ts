import { createContext, useContext } from 'react';
import type { GestureType } from 'react-native-gesture-handler';

/**
 * The dealt card's flip gesture, published to everything drawn on its faces.
 *
 * Exists because the card's "tap anywhere to flip" (design §5) and the buttons
 * on its faces are two different gesture systems arguing over the same touch.
 * `PressableScale` is an RN `Pressable` — the JS responder system — while the
 * flip is an RNGH `Tap`. When an RNGH gesture activates it cancels RN's
 * in-flight touches outright, and a `Tap` activates on tap-*up*: the same
 * instant a `Pressable` would fire `onPress`. Which one won came down to the
 * order UIKit happened to deliver `touchesEnded:`, so Join was dead on some
 * taps and both fired on others (docs/testing/dealt-event-card.md §O).
 *
 * With the flip's ref in context, a control on the card can declare
 * `blocksExternalGesture(flip)` — RNGH then arbitrates the two natively, and
 * the flip simply does not activate for a touch the control claimed. The
 * alternative was shrinking the tap to the card's dead space, which §5 rules
 * out.
 *
 * `null` outside a card, which is the common case: `PressableScale` then stays
 * exactly the RN `Pressable` it has always been, so nothing else in the app
 * changes behaviour.
 */
export const CardTapContext = createContext<GestureType | null>(null);

export function useCardTap(): GestureType | null {
  return useContext(CardTapContext);
}
