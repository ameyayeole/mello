import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { RADIUS, SPACING } from '@/constants/spacing';
import { CardTapContext } from './cardTapContext';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import type { DealtOrigin } from '@/stores/uiStore';
// DIM_OPACITY, TAP_SLOP, CARD_SHADOW_OPACITY, CARD_ELEVATION and `haptic` were
// all declared in this file and copied verbatim into `EventDeck`. They are
// shared now — see that module's header for why a copied number is the same
// silent-drift shape as a hand-typed query key.
import {
  CARD_ELEVATION,
  CARD_SHADOW_OPACITY,
  DEAL_MS,
  DIM_OPACITY,
  DISMISS_MS,
  FLIP_MS,
  PROMOTE_MS,
  STACK_DEPTH,
  TAP_SLOP,
  haptic,
  isPastThreshold,
  stackLayer,
} from './dealtCardGeometry';
import { themedStyles } from '@/theme';

export interface DealtCardProps {
  // One entry per card in the deck, front to back. index 0 is face up.
  // Only the first STACK_DEPTH + 2 are drawn (see the slice below), so a caller
  // may hand over more than that and let this decide.
  cards: { key: string; front: ReactNode; back: ReactNode }[];
  origin: DealtOrigin | null;
  // Where each card individually lifts off from, by depth — when the thing you
  // tapped was itself a stack. Falls back to `origin` for every card when the
  // opener is a single element like a map pin.
  origins?: DealtOrigin[];
  // The angle each card starts at, by depth — the tilt it was lying at before
  // it lifted. Lets a deck leave a fan looking like the cards that were in it.
  // Falls back to a single lean for anything opened from a flat element.
  originTilts?: number[];
  // Chrome laid over the dim, above and below the card — the swipe deck's
  // counter and its pass/save/undo row. `ReactNode`, so this stays
  // content-agnostic: the card knows it has furniture to place, not what the
  // furniture is for.
  //
  // There used to be a "N more behind" count under the stack. Cut: the stack
  // itself already says there is more, and a number under it was one more thing
  // asking to be read on a surface meant to be looked at.
  header?: ReactNode;
  footer?: ReactNode;
  onPass: () => void;
  onSave: () => void;
  onDismiss: () => void;
  // Fired the moment the card crosses edge-on onto its back face, and again
  // (with `false`) if it is turned back. Added for the wrap's launch card,
  // where the turn IS the action — it reveals the mark and then hands off to
  // the flow — rather than a way to read more about the thing on the front.
  //
  // A prop on the primitive, not a fork of it: AGENTS.md records what forking
  // this codebase's primitives has already cost.
  onFaceChange?: (backShowing: boolean) => void;
}

export const DEALT_CARD_WIDTH_RATIO = 0.78;
export const DEALT_CARD_ASPECT = 1.55;

// A hint of curve on the way up — just enough that the path is not a ruler
// line. Anything more reads as the card flying rather than being dealt.
//
// Lateral spread, off. Cards go straight from the fan to the middle; what
// separates them is the beat between them, not a detour. Kept as a constant
// rather than deleted because it is the first thing to reach for if they ever
// need to stop overlapping in flight.
const ARC_LIFT = 10;
// The overshoot: it passes 3% past its resting size before settling. Cheap,
// and the difference between "a view appeared" and "an object landed".
const DEAL_SWING = 0;
// A slight extra turn on the way, on top of the difference between the angle
// the card was lying at in the fan and the angle it lands at. Small: the card
// travels from the fan up to the middle of the screen and settles, and anything
// more than a few degrees of added rotation stops reading as a deal and starts
// reading as a spin.
const DEAL_SPIN = 10;

const OVERSHOOT = 1.03;

// The beat between one card leaving the fan and the next. Long enough that a
// card is most of the way home before the one behind it lifts, which is what
// makes them read as three cards being dealt rather than one thick card
// arriving — at 110ms they overlapped into a single moving blob.
const DEAL_STAGGER_MS = 360;
const DISMISS_STAGGER_MS = 70;

// The card has no origin (a deep link, or a notification whose banner has
// already gone). It comes up off the bottom edge instead — a real motion
// rather than a shrug.
const NO_ORIGIN_ROTATE = -14;
const NO_ORIGIN_SCALE = 0.55;

// "Tap for details", floating above the stack.
//
// It belongs to the presentation, not to the card's content: whether a thing
// can be turned over is a fact about how it is being shown, and a card in a
// feed has no back to promise. It also used to sit ON the card — first across
// the photo, then hanging off a corner — and both put it in front of the
// picture you are meant to be looking at. Above the stack it is legible on the
// dim and out of the way of everything.
//
// Breathes by lifting rather than fading; a label changing opacity reads as a
// glitch, one that moves reads as alive.
//
// Exported: `EventDeck` has a back face too (design doc §2), and this is the
// same fact about the same kind of surface, not a second copy of it. Its
// caller controls the ONE thing that differs between them — `bottom`, since
// the deck's card sits in a differently-shaped stage than a single dealt
// card's — and owns its own visibility/fade; this component only knows how to
// breathe in place.
export function FlipHint({ bottom }: { bottom: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withDelay(1600, withTiming(1, { duration: 900 })),
        withTiming(0, { duration: 900 })
      ),
      -1,
      false
    );
  }, [pulse]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -pulse.value * 3 }, { scale: 1 + pulse.value * 0.03 }],
  }));
  return (
    <Animated.View style={[styles.hintWrap, { bottom }, style]} pointerEvents="none">
      <View style={styles.hint}>
        <Text style={styles.hintText}>Tap for details</Text>
      </View>
    </Animated.View>
  );
}

/**
 * A card dealt out of whatever you tapped, landing centre screen over a dimmed
 * world, with the rest of its deck thrown messily behind it.
 *
 * Content-agnostic on purpose: it takes rendered faces and knows nothing about
 * what is on them. The community feed will deal something that is not an event.
 *
 * Gestures — tap flips, left/right pass and save at the same threshold the
 * swipe deck uses, down sends it home, up rubber-bands.
 */
export function DealtCard({
  cards,
  origin,
  origins,
  originTilts,
  header,
  footer,
  onPass,
  onSave,
  onDismiss,
  onFaceChange,
}: DealtCardProps) {
  const { width, height } = useWindowDimensions();
  const cardW = Math.round(width * DEALT_CARD_WIDTH_RATIO);
  const cardH = Math.round(cardW * DEALT_CARD_ASPECT);

  // 0 → at the origin, 1 → landed. Drives the deal, the dim and the dismiss.
  const deal = useSharedValue(0);
  // 0 → front, 1 → back.
  const flip = useSharedValue(0);
  // Live drag offsets on the top card.
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);

  // Mirrors `flip` onto the JS thread — only so the pan gesture below can pick
  // its axis config for the face that is showing (see the gesture block).
  // Nothing else reads this; `flip` itself remains the single source of truth
  // for anything worklet-side.
  const [backShowing, setBackShowing] = useState(false);

  // Kept in a ref so the flip reaction below does not have to be rebuilt when a
  // caller passes a new closure each render.
  const faceChangeRef = useRef(onFaceChange);
  useEffect(() => {
    faceChangeRef.current = onFaceChange;
  }, [onFaceChange]);
  const announceFace = useCallback((back: boolean) => {
    faceChangeRef.current?.(back);
  }, []);

  // Where a card starts, relative to its landed position at screen centre.
  // Per-depth when the opener handed over one rect per card; otherwise every
  // card shares the single origin. With no origin at all it comes up off the
  // bottom edge instead.
  function startFor(depth: number) {
    const from = origins?.[depth] ?? origin;
    if (!from) {
      return {
        x: 0,
        y: height * 0.72,
        scale: NO_ORIGIN_SCALE,
        rotate: NO_ORIGIN_ROTATE,
      };
    }
    return {
      x: from.x + from.width / 2 - width / 2,
      y: from.y + from.height / 2 - height / 2,
      scale: Math.max(from.width / cardW, from.height / cardH, 0.08),
      rotate: originTilts?.[depth] ?? -16,
    };
  }

  // Cards leave the fan one at a time, deepest first, so the deck reads as a
  // hand being dealt onto a table rather than a block of cards teleporting.
  // `deal` still runs 0 -> 1 once; each layer takes its own slice of it (see
  // `CardLayer`'s `startAt`), so the whole run is one card's arc plus a beat
  // for every card behind it.
  const layerCount = Math.min(cards.length, STACK_DEPTH + 2);
  const dealMs = DEAL_MS + Math.max(0, layerCount - 1) * DEAL_STAGGER_MS;
  useEffect(() => {
    deal.value = withTiming(1, {
      duration: dealMs,
      // Moves off decisively and settles — no skid, no snap.
      easing: Easing.bezier(0.22, 0.7, 0.28, 1),
    });
  }, [deal, dealMs]);

  // The click of the card going through edge-on. Also mirrors which face is
  // showing onto `backShowing` (JS thread) — the one thing `pan` below needs
  // that a worklet read of `flip.value` can't give it: a gesture's axis config
  // is fixed when the gesture object is built, not read live, so which axes the
  // pan claims has to be decided on the JS side from here.
  useAnimatedReaction(
    () => flip.value,
    (now, before) => {
      if (before == null) return;
      const crossed =
        (before < 0.5 && now >= 0.5) || (before > 0.5 && now <= 0.5);
      if (crossed) {
        runOnJS(haptic)('flip');
        runOnJS(setBackShowing)(now >= 0.5);
        runOnJS(announceFace)(now >= 0.5);
      }
    }
  );

  // `deal` is read above in a `useAnimatedReaction` selector, so writing it
  // here trips react-hooks/immutability. Tried moving the write into a
  // `useEffect` behind a counter state — the shape CommentRow/PostActionBar
  // use for a press-driven shared-value write — but that only clears the
  // rule for THEIR case, where the value is read solely via
  // `useAnimatedStyle`. `deal` is read via `useAnimatedReaction` (required
  // here so the landing haptic fires off the animation's own progress, not a
  // timer), and that specific read/write shape still trips the rule from
  // inside an effect. Routing through state would also add a render round
  // trip between the gesture ending and the send-home animation starting, a
  // real latency regression for no gain. Left as a direct write; the rule is
  // `warn` by design for exactly this reason (see eslint.config.js).
  function sendHome() {
    deal.value = withTiming(
      0,
      // Reversed by construction: running the same staggered timeline backwards
      // means the top card leaves first and the deck squares itself back into
      // the fan behind it.
      { duration: DISMISS_MS + Math.max(0, layerCount - 1) * DISMISS_STAGGER_MS,
        easing: Easing.bezier(0.5, 0, 0.75, 0.3) },
      (done) => {
        if (done) runOnJS(onDismiss)();
      }
    );
  }

  function commit(direction: 1 | -1) {
    // Only a save gets the success notification — a pass is not a success,
    // and the threshold tick (fired already, from the pan gesture below)
    // already told the finger that the swipe took.
    if (direction === 1) haptic('save');
    dx.value = withTiming(direction * width * 1.4, { duration: 300 }, (done) => {
      if (done) {
        dx.value = 0;
        dy.value = 0;
        flip.value = 0;
        runOnJS(direction === 1 ? onSave : onPass)();
      }
    });
  }

  // Set in `onEnd` the instant a commit (swipe past threshold) or a
  // decisive-down dismiss has been kicked off, so `onFinalize` below knows
  // not to re-snap `dx`/`dy` on top of an animation already in flight. Reset
  // the moment `onFinalize` reads it — it only needs to survive the one
  // onEnd → onFinalize hop RNGH makes for a single gesture attempt.
  const settling = useSharedValue(false);

  // A latch, not a plain flag read once at onEnd: the spec wants the
  // threshold tick the instant the swipe first takes — while the finger is
  // still down, so you feel it will commit before you let go — not a single
  // check at release. Arms at the start of every drag, fires once as
  // `isPastThreshold` first goes true, then disarms so it never buzzes every
  // frame past the line; falling back under the threshold re-arms it, so
  // crossing again (a hesitation, then a real swipe) ticks again.
  const thresholdArmed = useSharedValue(true);

  // Axis gating rather than an on/off switch, so pass/save works on BOTH faces.
  //
  // The back was previously dead to the pan entirely, because the outer
  // `GestureDetector` wraps both faces (the flip is a cross-fade, not a swap of
  // subtrees) and would otherwise claim the touch stream ahead of the back's
  // `ScrollView` on every drag. Disabling it fixed the scroll and cost the
  // swipe.
  //
  // Both work if the gesture is told which axis it owns:
  //   • horizontal always activates the pan — that is pass/save, and it means
  //     the same thing on either face.
  //   • on the FRONT, vertical activates it too — drag-down dismiss, and the
  //     up rubber-band.
  //   • on the BACK, vertical *fails* it, handing the stream to the scroll.
  //
  // The horizontal threshold doubles as tap protection: a press that never
  // travels 12pt cannot start a pan, so a button press is not competing with a
  // gesture that already claimed the touch.
  const pan = (
    backShowing
      ? Gesture.Pan().activeOffsetX([-12, 12]).failOffsetY([-10, 10])
      : Gesture.Pan().activeOffsetX([-12, 12]).activeOffsetY([-12, 12])
  )
    .onStart(() => {
      // Defensive: guarantees a clean flag at the start of every new drag
      // even if some prior attempt's onFinalize somehow didn't run.
      settling.value = false;
      thresholdArmed.value = true;
    })
    .onUpdate((e) => {
      dx.value = e.translationX;
      // Up rubber-bands: it has no job, and letting it travel freely would
      // imply it does.
      dy.value = e.translationY < 0 ? e.translationY * 0.25 : e.translationY;

      const pastThreshold = isPastThreshold(e.translationX, e.velocityX, width);
      if (pastThreshold && thresholdArmed.value) {
        thresholdArmed.value = false;
        runOnJS(haptic)('threshold');
      } else if (!pastThreshold) {
        thresholdArmed.value = true;
      }
    })
    .onEnd((e) => {
      if (isPastThreshold(e.translationX, e.velocityX, width)) {
        settling.value = true;
        runOnJS(commit)(e.translationX > 0 ? 1 : -1);
        return;
      }
      // A decisive downward drag sends it home.
      if (e.translationY > height * 0.18 || e.velocityY > 1100) {
        settling.value = true;
        dx.value = withTiming(0, { duration: 160 });
        dy.value = withTiming(0, { duration: 160 });
        runOnJS(sendHome)();
        return;
      }
      // The plain "released below both thresholds" reset used to live here,
      // but `onEnd` only fires on a real completed gesture — RNGH force-ends
      // an *active* pan when `.enabled(false)` flips it off mid-drag (exactly
      // what happens here when a flip crosses 0.5 while dragging), and that
      // termination path skips `onEnd` entirely. Moved to `onFinalize`, which
      // RNGH guarantees runs on every termination — success, failure,
      // cancellation, or a forced disable — so a drag interrupted by the
      // flip can no longer leave `dx`/`dy` frozen at a stale offset.
    })
    .onFinalize(() => {
      if (settling.value) {
        settling.value = false;
        return;
      }
      dx.value = withTiming(0, { duration: 220 });
      dy.value = withTiming(0, { duration: 220 });
    });

  // `maxDistance` matters more than it looks. Without it a slow drag that
  // ended under the swipe threshold — so the pan committed nothing — still
  // satisfied the tap and flipped the card. A flip you did not ask for, from a
  // gesture you meant as a swipe.
  //
  // UNRESOLVED, and the highest-risk interaction on this component: this tap
  // covers both faces whole, and every control on them (`Button`, `IconButton`,
  // `PressableScale`) is an RN `Pressable` on the JS responder system, not an
  // RNGH handler. When any RNGH gesture activates, RNGH cancels RN's in-flight
  // touches outright — `RNGestureHandlerManager.mm`'s
  // `didActivateInViewWithTouchHandler:` disables and re-enables
  // `RCTSurfaceTouchHandler`. A Pan only activates once you move, so it costs
  // presses nothing; a Tap activates on every clean tap-up, which is the same
  // instant a `Pressable` would fire `onPress`. Whether the press wins depends
  // on the order UIKit happens to deliver `touchesEnded:` in, which is not
  // specified — so this is either "Join is dead and the card flips instead" or
  // "Join fires and the card also flips", and both are wrong. It cannot be
  // reproduced under Jest (Reanimated 4 throws on import) and has never been
  // run. Section O of docs/testing/dealt-event-card.md is the row that settles
  // it; if it fails, the fix is to make the card's pressables RNGH-aware rather
  // than to shrink this gesture, because design §5 is "tap the card, anywhere".
  //
  // Same immutability rule, same reason, same fallback as `sendHome` above —
  // `flip` is also read via `useAnimatedReaction` (for the flip haptic), so a
  // `useEffect` detour would not clear the warning either. Direct write.
  // Published through CardTapContext so the controls drawn on the faces can
  // declare `blocksExternalGesture` against it — that is what settles §O's
  // race, in RNGH rather than in whatever order UIKit delivers touchesEnded.
  // `useMemo` because the identity has to be stable: it is a dependency of
  // every child control's gesture, and a new object each render would rebuild
  // all of them.
  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(400)
        .maxDistance(TAP_SLOP)
        .onEnd(() => {
          flip.value = withTiming(flip.value > 0.5 ? 0 : 1, {
            duration: FLIP_MS,
            easing: Easing.bezier(0.5, 0.05, 0.2, 1),
          });
        }),
    [flip]
  );

  const gesture = Gesture.Exclusive(pan, tap);

  const dimStyle = useAnimatedStyle(() => ({
    opacity: deal.value * DIM_OPACITY,
  }));
  // Fades in with the deal rather than being there from frame one — it belongs
  // to the stack that is still arriving.

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* The dim gets its own wrapper, and the stage carries an explicit
          zIndex above it, because the two were fighting over DEPTH rather than
          paint order.

          The card's transform contains a `perspective`, which gives it real
          z-extent: as it flips, the half turning away from you moves to
          negative z. The dim is a flat plane at z = 0 filling the screen, and
          it was a direct sibling of the card's stage — so Core Animation
          depth-sorted them and drew the dim OVER whichever half of the card had
          sunk behind it. On screen that reads as a hard vertical band down the
          rotation axis, darkest mid-turn. Painting order alone never fixed it:
          the dim is rendered first and was still winning.

          Confirmed by making the dim bright green and flipping a card — the
          bands turned green.

          The wrapper gives the dim its own compositing context so it stops
          being a peer in the card's 3D space, and the stage's zIndex maps to
          `zPosition` on iOS, which puts the whole card layer in front of that
          plane no matter where its own geometry sits. */}
      <View style={styles.dimWrap} pointerEvents="box-none">
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}
          onTouchEnd={sendHome}
        />
      </View>
      {header && (
        <View style={styles.header} pointerEvents="box-none">
          {header}
        </View>
      )}
      {/* Everything drawn on a face sits under this, so any PressableScale on
          the card can block the flip rather than race it (§O). Only the top
          card actually carries `gesture`, but the provider covers the whole
          stage — a buried card's controls are not hit-testable anyway, and
          scoping it per-layer would mean a different context value per depth
          for no behavioural difference. */}
      <CardTapContext.Provider value={tap}>
      <View style={styles.stage} pointerEvents="box-none">
        {/* Deepest first so DOM order paints correctly without z-index games.
            STACK_DEPTH + 2, not + 1: the extra layer is the one parked at
            opacity 0 on `stackLayer`'s deeper-than-STACK_DEPTH branch, so that
            when the stack shortens there is always a card already mounted to
            fade in rather than one popping into existence at full opacity.
            With + 1 that branch — and the test covering it — was unreachable. */}
        {cards
          .slice(0, STACK_DEPTH + 2)
          .map((c, depth) => ({ c, depth }))
          .reverse()
          .map(({ c, depth }) => (
            <CardLayer
              key={c.key}
              depth={depth}
              width={cardW}
              height={cardH}
              deal={deal}
              flip={flip}
              dx={dx}
              dy={dy}
              start={startFor(depth)}
              front={c.front}
              back={c.back}
              backShowing={backShowing}
              // Top card first, the rest following it up. Dealing deepest-first
              // left the screen empty for the whole stagger before anything you
              // could see arrived, which read as a stall then a jump rather
              // than as cards moving.
              startAt={(depth * DEAL_STAGGER_MS) / dealMs}
              gesture={depth === 0 ? gesture : null}
            />
          ))}
      </View>
      </CardTapContext.Provider>
      {/* "N more behind" (design §6). Positioned off the card's own height
          rather than laid out in the stage, whose children are all absolute so
          the deck can overlap. pointerEvents none — it is a label, not a
          control, and it sits over the dim, which owns tap-to-dismiss. */}
      {/* Only while the front is up and there is something to turn to. */}
      {!backShowing && cards[0]?.back != null && (
        <FlipHint bottom={height / 2 + cardH / 2 + SPACING[4]} />
      )}
      {footer && (
        <View style={styles.footer} pointerEvents="box-none">
          {footer}
        </View>
      )}
    </View>
  );
}

function CardLayer({
  depth,
  width,
  height,
  deal,
  flip,
  dx,
  dy,
  start,
  front,
  back,
  backShowing,
  startAt,
  gesture,
}: {
  depth: number;
  width: number;
  height: number;
  deal: SharedValue<number>;
  flip: SharedValue<number>;
  dx: SharedValue<number>;
  dy: SharedValue<number>;
  start: { x: number; y: number; scale: number; rotate: number };
  front: ReactNode;
  back: ReactNode;
  // Which face the top card is showing. Drives the mount swap in the render
  // below; only meaningful when `depth === 0`.
  backShowing: boolean;
  // Where in the shared 0->1 deal this card's own arc begins. Deepest card
  // starts at 0, the top card starts last — which is what makes the deck deal
  // one at a time, and (running the same timeline backwards) gather itself up
  // top-card-first on the way out.
  startAt: number;
  gesture: ReturnType<typeof Gesture.Exclusive> | null;
}) {
  const layer = stackLayer(depth);
  const isTop = depth === 0;

  // The animated resting place for this layer, seeded at mount to exactly
  // `layer`'s values so the initial `deal` arc below (start -> this) is
  // unopposed. When `depth` changes later — the card above this one was
  // swiped away, promoting this one up a place — the effect below re-targets
  // these over PROMOTE_MS instead of the transform recomputing instantly from
  // the new `stackLayer(depth)`, which would make every card behind the top
  // one snap to its new position the instant the swipe completes.
  const targetX = useSharedValue(layer.x);
  const targetY = useSharedValue(layer.y);
  const targetRotate = useSharedValue(layer.rotate);
  const targetScale = useSharedValue(layer.scale);
  const targetOpacity = useSharedValue(layer.opacity);
  const targetShade = useSharedValue(layer.shade);

  // Guards the very first run: a depth prop is present on mount too, and
  // that arrival is the `deal` animation's job, not a promotion.
  const mountedDepth = useRef(depth);
  useEffect(() => {
    if (mountedDepth.current === depth) return;
    mountedDepth.current = depth;
    const next = stackLayer(depth);
    targetX.value = withTiming(next.x, { duration: PROMOTE_MS });
    targetY.value = withTiming(next.y, { duration: PROMOTE_MS });
    targetRotate.value = withTiming(next.rotate, { duration: PROMOTE_MS });
    targetScale.value = withTiming(next.scale, { duration: PROMOTE_MS });
    targetOpacity.value = withTiming(next.opacity, { duration: PROMOTE_MS });
    targetShade.value = withTiming(next.shade, { duration: PROMOTE_MS });
  }, [depth, targetOpacity, targetRotate, targetScale, targetShade, targetX, targetY]);

  // This card's own slice of the shared deal.
  const progress = useDerivedValue(() =>
    interpolate(deal.value, [startAt, 1], [0, 1], Extrapolation.CLAMP)
  );

  // Each card ticks as it lands. The top one gets the heavier thud — it lands
  // last and it is the one you are about to look at; the rest are the sound of
  // the deck settling behind it.
  useAnimatedReaction(
    () => progress.value,
    (now, before) => {
      if (before != null && before < 0.9 && now >= 0.9) {
        runOnJS(haptic)(isTop ? 'land' : 'settle');
      }
    }
  );

  // Each card takes its own path out of the fan: alternating sides, widening
  // with depth, so three cards leaving the same small stack are three separate
  // objects in the air rather than one line of overlapping ones. Peaks at the
  // midpoint and closes back to zero, so they converge into the stack exactly
  // as they land.
  const swingDir = depth % 2 === 0 ? 1 : -1;
  const swingAmount = DEAL_SWING * (0.55 + depth * 0.3) * swingDir;
  // Alternating so consecutive cards spin opposite ways out of the hand.
  const spin = DEAL_SPIN * swingDir;

  const boxStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const flipValue = isTop ? flip.value : 0;
    const arc = interpolate(p, [0, 0.45, 1], [0, -ARC_LIFT, 0], Extrapolation.CLAMP);
    const swing = interpolate(p, [0, 0.5, 1], [0, swingAmount, 0], Extrapolation.CLAMP);
    const scale =
      interpolate(p, [0, 0.82, 1], [start.scale, targetScale.value * OVERSHOOT, targetScale.value], Extrapolation.CLAMP);
    const rotate = interpolate(p, [0, 1], [start.rotate, targetRotate.value], Extrapolation.CLAMP);
    const x = interpolate(p, [0, 1], [start.x, targetX.value], Extrapolation.CLAMP);
    const y = interpolate(p, [0, 1], [start.y, targetY.value], Extrapolation.CLAMP);

    // The shadow has to fade out through the turn.
    //
    // A shadow is drawn from the layer's own rectangle, and a 3D rotation
    // foreshortens the card without narrowing that rectangle to match — so
    // from about 30° onward the shadow spills out past both edges as two dark
    // bands, worst at edge-on where the card is a sliver and its shadow is
    // still full width. sin() is 0 at both rest positions and 1 at 90°, which
    // is exactly the shape of the problem: full shadow when the card is flat
    // and facing you, none at the moment it is on its edge and has no face to
    // cast one anyway.
    const edgeOn = Math.sin(flipValue * Math.PI);
    const shadow = 1 - edgeOn;

    return {
      opacity: targetOpacity.value * interpolate(p, [0, 0.12], [0.15, 1], Extrapolation.CLAMP),
      shadowOpacity: CARD_SHADOW_OPACITY * shadow,
      // Android draws no shadow from `shadowOpacity`; `elevation` is its knob,
      // and it has the same spill.
      elevation: CARD_ELEVATION * shadow,
      // `perspective` first, and the whole lot on the CARD — not on an inner
      // wrapper. The rotateY used to live one view further in, which meant the
      // card's own fill, radius and shadow sat perfectly still while its
      // contents spun inside them: the frame didn't turn, so the flip read as
      // a cross-fade in a static white box rather than an object being turned
      // over. Whatever carries the card's surface has to be the thing that
      // rotates.
      transform: [
        { perspective: 1200 },
        { translateX: x + swing + (isTop ? dx.value : 0) },
        { translateY: y + arc + (isTop ? dy.value : 0) },
        {
          // The spin decays across the flight rather than peaking in the
          // middle: the card leaves the hand already turning and is close to
          // its landing angle well before it stops moving, which is how a
          // flicked card actually behaves.
          rotateZ: `${
            rotate +
            interpolate(p, [0, 1], [spin, 0], Extrapolation.CLAMP) +
            (isTop ? dx.value / 22 : 0)
          }deg`,
        },
        { rotateY: `${flipValue * 180}deg` },
        { scale },
      ],
    };
  });

  // Only ONE face is mounted at a time — see the render below for why an
  // opacity cross-fade could not stay.
  // Animated rather than a plain `layer.shade` opacity, so a promotion (this
  // card moving from depth 2's shade to depth 1's, or depth 1's to the top
  // card's zero) fades over PROMOTE_MS instead of the overlay jumping — or,
  // for a promotion straight to the top, disappearing outright.
  const shadeStyle = useAnimatedStyle(() => ({
    opacity: targetShade.value,
  }));

  const body = (
    <Animated.View
      style={[styles.card, { width, height }, boxStyle]}
      pointerEvents={isTop ? 'auto' : 'none'}
    >
      {/* One face at a time, swapped at the edge-on crossing — NOT two faces
          cross-faded by opacity, and not `backfaceVisibility` either.

          Both alternatives fail, for different reasons:

          `backfaceVisibility: 'hidden'` on a 3D-rotated view is inconsistent
          on Android and fails by ghosting both faces through each other.

          Cross-fading two mounted faces looks correct until the card itself
          starts rotating in 3D. The faces are coplanar `absoluteFill`
          siblings and the back carries its own counter-rotation, so once
          there is a real rotateY on the card the two layers z-fight: a hard
          vertical seam appears straight down the rotation axis with one half
          of the card visibly darker than the other, worst mid-turn. An
          opacity of 0 does not take a layer out of that fight.

          Mounting one face removes the fight by construction. The swap lands
          at the 0.5 crossing, where the card is edge-on and effectively a
          line, so nothing is visible to pop. It also means the back's
          subtree — its ScrollView and everything in it — no longer sits
          mounted and laying out behind a face nobody is looking at. */}
      {isTop && backShowing ? (
        <View style={[StyleSheet.absoluteFill, styles.face, styles.backFace]}>
          {back}
        </View>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.face]}>{front}</View>
      )}
      {/* No CSS filter in React Native — the "dimmer further back" is a real
          overlay, always mounted (rather than gated on `layer.shade > 0`) so
          it can animate rather than pop in or out when a promotion crosses
          the top-card boundary. */}
      <Animated.View pointerEvents="none" style={[styles.shade, shadeStyle]} />
    </Animated.View>
  );

  if (!gesture) return body;
  return <GestureDetector gesture={gesture}>{body}</GestureDetector>;
}

const styles = themedStyles(() => ({
  dimWrap: { ...StyleSheet.absoluteFill, zIndex: 0 },
  dim: { backgroundColor: COLORS.ink },
  stage: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  // Chrome over the dim. `header` hugs the top safe area, `footer` the bottom;
  // both are box-none so only their own controls take touches and the dim
  // behind them still dismisses.
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  hintWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  // White pill on the dim, matching the map teaser's "Up for it?" bubble —
  // those are the app's only two "this does something" tags and one shape is
  // cheaper to learn than two.
  hint: {
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1.5],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
  },
  hintText: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textPrimary,
  },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2 },
  card: {
    position: 'absolute',
    borderRadius: RADIUS['2xl'],
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.shadowWarm,
    shadowOffset: { width: 0, height: 20 },
    shadowRadius: 30,
    // shadowOpacity and elevation are set by `boxStyle`, which fades them out
    // through the flip — see the comment there.
  },
  face: { borderRadius: RADIUS['2xl'], overflow: 'hidden' },
  // Un-mirrors the back's content, since the container it sits in has turned
  // 180°. `scaleX: -1` and not `rotateY: '180deg'` — they look identical here
  // and the difference is entirely in how Core Animation renders them.
  //
  // The card already carries a real 3D transform (perspective + rotateY). A
  // rotateY here nests a SECOND one inside it, and iOS renders a layer with a
  // 3D transform by rasterising it into a texture and transforming that — so
  // the back's text and avatars were resampled and came out soft, while the
  // front, which has no nested transform, stayed crisp. That asymmetry is the
  // tell.
  //
  // `scaleX` is a 2D affine transform. It mirrors exactly the same way and
  // keeps the layer in the normal vector-drawing path, so the back renders at
  // full resolution.
  backFace: { transform: [{ scaleX: -1 }] },
  shade: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS['2xl'],
    backgroundColor: COLORS.ink,
  },
}));
