import {
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

// How messages arrive. Four entrances, because four different things are
// happening and one curve for all of them is what made the thread feel
// generic.
//
// All of them are **custom** rather than Reanimated's presets. `ZoomIn` scales
// from 0 — a bubble popping out of nothing, which reads as a notification
// rather than as a message. Everything here starts near its resting size, or
// off-screen where it genuinely came from.

// For the tapback overlay. Overdamped enough to settle without wobble: a
// message being raised should feel held, not thrown.
const LIFT = { damping: 15, stiffness: 240, mass: 0.5 };

/**
 * A message you just sent: it comes out from **behind the composer** and
 * slides up into place.
 *
 * The start offset is deliberately past the bottom of the list, which the
 * scroll view clips — so the bubble is genuinely hidden behind the message bar
 * before it moves, rather than fading in just above it.
 *
 * The feel is the tab bar's indicator, which is the app's existing answer to
 * "show me this moved": a spring that overshoots slightly rather than stopping
 * dead, plus a stretch along the direction of travel that leads the movement
 * and relaxes as it lands. There it stretches on X because it travels
 * sideways; here it stretches on Y. Gentler numbers than the tab bar's — that
 * fires when you change tabs, this fires on every message you send.
 */
const GLIDE = { stiffness: 190, damping: 19, mass: 0.85 };
const SEND_FROM = 72;
const STRETCH_IN_MS = 90;
const STRETCH_OUT_MS = 190;
const STRETCH_Y = 1.09;
const SQUASH_X = 0.96;

export function sendEnter() {
  'worklet';
  return {
    initialValues: {
      opacity: 1,
      transform: [{ translateY: SEND_FROM }, { scaleY: 1 }, { scaleX: 1 }],
    },
    animations: {
      // No fade: it was never invisible, it was behind the bar.
      opacity: withTiming(1, { duration: 0 }),
      transform: [
        { translateY: withSpring(0, GLIDE) },
        {
          scaleY: withSequence(
            withTiming(STRETCH_Y, {
              duration: STRETCH_IN_MS,
              easing: Easing.out(Easing.quad),
            }),
            withTiming(1, {
              duration: STRETCH_OUT_MS,
              easing: Easing.inOut(Easing.quad),
            })
          ),
        },
        {
          scaleX: withSequence(
            withTiming(SQUASH_X, {
              duration: STRETCH_IN_MS,
              easing: Easing.out(Easing.quad),
            }),
            withTiming(1, {
              duration: STRETCH_OUT_MS,
              easing: Easing.inOut(Easing.quad),
            })
          ),
        },
      ],
    },
  };
}

/**
 * A message from someone else: it pops, and that is all.
 *
 * Theirs did not travel from anywhere — it arrived — so there is nothing to
 * slide. A small scale-up with a touch of overshoot says "this is new" and
 * gets out of the way. No translation at all: a bubble sliding in from below
 * implies it came from your composer, which is the one thing it did not do.
 */
const POP = { damping: 13, stiffness: 320, mass: 0.5 };

export function receiveEnter() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.92 }] },
    animations: {
      opacity: withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }),
      transform: [{ scale: withSpring(1, POP) }],
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
