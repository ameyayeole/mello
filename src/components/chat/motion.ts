import { withSpring, withTiming } from 'react-native-reanimated';

// How things arrive in a chat: the constants a message's own entrance is built
// from, and the two custom entrances the tapback overlay uses.
//
// The overlay's are custom rather than Reanimated's presets because `ZoomIn`
// scales from 0 — something popping out of nothing, which reads as a
// notification rather than as the message you are already looking at being
// raised.

// For the tapback overlay. Overdamped enough to settle without wobble: a
// message being raised should feel held, not thrown.
const LIFT = { damping: 15, stiffness: 240, mass: 0.5 };

// ── The bubble's own arrival ─────────────────────────────────────────────────
//
// These are constants rather than an `entering` animation, and that is the
// whole point. Reanimated's `entering` lays the view out *first* and applies
// its initial values a frame later — so a bubble with no fade flashed at its
// resting place before dropping back down to start its slide. Inside a
// FlatList cell it was consistently visible.
//
// MessageBubble drives them through `useAnimatedStyle`, which is evaluated
// with the first render, so the first frame is already correct.

/**
 * Yours: out from behind the composer and up into place.
 *
 * `SEND_FROM` is past the bottom of the list, which the scroll view clips, so
 * the bubble is genuinely hidden behind the message bar before it moves.
 *
 * The give comes from the stretch, **not** from the travel. Borrowing the tab
 * bar's spring wholesale put the bounce in the wrong place: at damping 19 and
 * stiffness 190 that spring is ζ≈0.75, so the bubble sailed past its resting
 * place and fell back onto it. On a 72pt rise that reads as the message
 * arriving twice. The indicator can overshoot because it is a 52pt chip
 * shuttling sideways under your thumb; a paragraph of text landing where you
 * are about to read it cannot.
 *
 * So the travel is critically damped — it decelerates into place and stops —
 * and the squash-and-stretch carries the sense of velocity instead, leading
 * the movement and relaxing as it lands. Same idea as the tab bar (which
 * stretches on X because it travels sideways; this stretches on Y), with the
 * bounce moved out of the position and into the shape.
 *
 * The stretch's 280ms total is matched to the spring's ~260ms settle on
 * purpose: the give should finish as the movement does, not after it.
 */
export const GLIDE = { stiffness: 190, damping: 26, mass: 0.85 };
export const SEND_FROM = 72;
export const STRETCH_IN_MS = 90;
export const STRETCH_OUT_MS = 190;
export const STRETCH_Y = 0.06;
export const SQUASH_X = 0.03;

/**
 * Theirs: a pop, and that is all.
 *
 * It did not travel from anywhere — it arrived — so nothing slides. Sliding it
 * up from below would imply it came out of your composer, which is the one
 * thing it did not do.
 */
export const POP = { damping: 15, stiffness: 320, mass: 0.5 };
export const POP_FROM = 0.08;

/**
 * The long-pressed message, lifting off the thread under the tapback bar.
 *
 * Starts at 94% rather than at nothing: this is the same message you are
 * already looking at, raised — not a new one arriving.
 */
export function liftEnter() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.94 }] },
    animations: {
      opacity: withTiming(1, { duration: 110 }),
      transform: [{ scale: withSpring(1, LIFT) }],
    },
  };
}

/** The tapback bar, arriving just behind the message it belongs to. */
export function barEnter() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 8 }, { scale: 0.9 }] },
    animations: {
      opacity: withTiming(1, { duration: 130 }),
      transform: [
        { translateY: withSpring(0, LIFT) },
        { scale: withSpring(1, LIFT) },
      ],
    },
  };
}
