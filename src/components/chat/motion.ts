import { withSpring, withTiming, Easing } from 'react-native-reanimated';

// How messages arrive. Three entrances, because three different things are
// happening and one curve for all of them is what made the thread feel
// generic.
//
// All of them are **custom** rather than Reanimated's presets. `ZoomIn` scales
// from 0 — a bubble popping out of nothing, which reads as a notification
// rather than as a message. Everything here starts near its resting size and
// settles into it.

// Springs, not durations. A message landing is a physical event; a duration
// makes it a slideshow. Both are overdamped enough to settle without wobble.
const LAND = { damping: 18, stiffness: 260, mass: 0.55 };
const LIFT = { damping: 15, stiffness: 240, mass: 0.5 };

/**
 * A message you just sent: it leaves the field and travels to its place.
 *
 * It starts down and to the **left** — where the text field is, not where the
 * send button is. The words were in that box a moment ago, so that is where
 * the bubble should come from; launching it from the button made it look like
 * the button had produced it.
 *
 * Eased in *and* out, deliberately not a spring. A spring leaves at full speed
 * and only decelerates; this gathers pace off the field and settles into its
 * place, which is what makes a short distance still read as travel. Small
 * numbers on purpose — this fires on every message, and anything with a
 * flourish in it gets old by the third one.
 */
const SEND_TRAVEL = { duration: 260, easing: Easing.inOut(Easing.cubic) };

export function sendEnter() {
  'worklet';
  return {
    initialValues: {
      opacity: 0,
      transform: [{ translateX: -18 }, { translateY: 18 }, { scale: 0.96 }],
    },
    animations: {
      // Fades in well before it lands, so what you watch is the movement
      // rather than the appearing.
      opacity: withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }),
      transform: [
        { translateX: withTiming(0, SEND_TRAVEL) },
        { translateY: withTiming(0, SEND_TRAVEL) },
        { scale: withTiming(1, SEND_TRAVEL) },
      ],
    },
  };
}

/** A message that arrived from someone else: settles in from below, gently. */
export function receiveEnter() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 14 }, { scale: 0.96 }] },
    animations: {
      opacity: withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
      transform: [
        { translateY: withSpring(0, LAND) },
        { scale: withSpring(1, LAND) },
      ],
    },
  };
}

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
