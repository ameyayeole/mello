import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/constants/colors';
import { RADIUS } from '@/constants/spacing';
import type { DealtOrigin } from '@/stores/uiStore';
import {
  DEAL_MS,
  DISMISS_MS,
  FLIP_MS,
  PROMOTE_MS,
  STACK_DEPTH,
  isPastThreshold,
  stackLayer,
} from './dealtCardGeometry';

export interface DealtCardProps {
  // One entry per card in the deck, front to back. index 0 is face up.
  cards: { key: string; front: ReactNode; back: ReactNode }[];
  origin: DealtOrigin | null;
  onPass: () => void;
  onSave: () => void;
  onDismiss: () => void;
}

export const DEALT_CARD_WIDTH_RATIO = 0.78;
export const DEALT_CARD_ASPECT = 1.55;

// How far the card lifts off the straight line between its origin and the
// centre, at the midpoint. This is what makes it an arc rather than a slide.
const ARC_LIFT = 26;
// The overshoot: it passes 3% past its resting size before settling. Cheap,
// and the difference between "a view appeared" and "an object landed".
const OVERSHOOT = 1.03;

// The card has no origin (a deep link, or a notification whose banner has
// already gone). It comes up off the bottom edge instead — a real motion
// rather than a shrug.
const NO_ORIGIN_ROTATE = -14;
const NO_ORIGIN_SCALE = 0.55;

function haptic(kind: 'land' | 'flip' | 'commit') {
  if (kind === 'land') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  else if (kind === 'flip') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else Haptics.selectionAsync();
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
  onPass,
  onSave,
  onDismiss,
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

  // Where the card starts, relative to its landed position at screen centre.
  // With no origin it starts below the bottom edge instead.
  const startX = origin
    ? origin.x + origin.width / 2 - width / 2
    : 0;
  const startY = origin
    ? origin.y + origin.height / 2 - height / 2
    : height * 0.72;
  const startScale = origin
    ? Math.max(origin.width / cardW, origin.height / cardH, 0.08)
    : NO_ORIGIN_SCALE;
  const startRotate = origin ? -16 : NO_ORIGIN_ROTATE;

  useEffect(() => {
    deal.value = withTiming(1, {
      duration: DEAL_MS,
      easing: Easing.bezier(0.2, 0.7, 0.3, 1),
    });
  }, [deal]);

  // The landing thud, fired from the animation's own progress rather than a
  // setTimeout — a timer drifts from the frame the card actually settles on,
  // and a haptic that lands late feels like a different event.
  useAnimatedReaction(
    () => deal.value,
    (now, before) => {
      if (before != null && before < 0.9 && now >= 0.9) runOnJS(haptic)('land');
    }
  );

  // The click of the card going through edge-on.
  useAnimatedReaction(
    () => flip.value,
    (now, before) => {
      if (before == null) return;
      const crossed =
        (before < 0.5 && now >= 0.5) || (before > 0.5 && now <= 0.5);
      if (crossed) runOnJS(haptic)('flip');
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
      { duration: DISMISS_MS, easing: Easing.bezier(0.5, 0, 0.75, 0.3) },
      (done) => {
        if (done) runOnJS(onDismiss)();
      }
    );
  }

  function commit(direction: 1 | -1) {
    haptic('commit');
    dx.value = withTiming(direction * width * 1.4, { duration: 300 }, (done) => {
      if (done) {
        dx.value = 0;
        dy.value = 0;
        flip.value = 0;
        runOnJS(direction === 1 ? onSave : onPass)();
      }
    });
  }

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      dx.value = e.translationX;
      // Up rubber-bands: it has no job, and letting it travel freely would
      // imply it does.
      dy.value = e.translationY < 0 ? e.translationY * 0.25 : e.translationY;
    })
    .onEnd((e) => {
      if (isPastThreshold(e.translationX, e.velocityX, width)) {
        runOnJS(commit)(e.translationX > 0 ? 1 : -1);
        return;
      }
      // A decisive downward drag sends it home.
      if (e.translationY > height * 0.18 || e.velocityY > 1100) {
        dx.value = withTiming(0, { duration: 160 });
        dy.value = withTiming(0, { duration: 160 });
        runOnJS(sendHome)();
        return;
      }
      dx.value = withTiming(0, { duration: 220 });
      dy.value = withTiming(0, { duration: 220 });
    });

  // Same rule, same reason, same fallback as `sendHome` above — `flip` is
  // also read via `useAnimatedReaction` (for the flip haptic), so a
  // `useEffect` detour would not clear the warning either. Direct write.
  const tap = Gesture.Tap().maxDuration(400).onEnd(() => {
    flip.value = withTiming(flip.value > 0.5 ? 0 : 1, {
      duration: FLIP_MS,
      easing: Easing.bezier(0.5, 0.05, 0.2, 1),
    });
  });

  const gesture = Gesture.Exclusive(pan, tap);

  const dimStyle = useAnimatedStyle(() => ({
    opacity: deal.value * 0.8,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}
        onTouchEnd={sendHome}
      />
      <View style={styles.stage} pointerEvents="box-none">
        {/* Deepest first so DOM order paints correctly without z-index games. */}
        {cards
          .slice(0, STACK_DEPTH + 1)
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
              start={{ x: startX, y: startY, scale: startScale, rotate: startRotate }}
              front={c.front}
              back={c.back}
              gesture={depth === 0 ? gesture : null}
            />
          ))}
      </View>
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

  const boxStyle = useAnimatedStyle(() => {
    // The deal interpolates from the origin to this layer's resting place, so
    // the whole stack arrives together rather than the top card arriving and
    // the rest appearing under it.
    const p = deal.value;
    const arc = interpolate(p, [0, 0.45, 1], [0, -ARC_LIFT, 0], Extrapolation.CLAMP);
    const scale =
      interpolate(p, [0, 0.82, 1], [start.scale, targetScale.value * OVERSHOOT, targetScale.value], Extrapolation.CLAMP);
    const rotate = interpolate(p, [0, 1], [start.rotate, targetRotate.value], Extrapolation.CLAMP);
    const x = interpolate(p, [0, 1], [start.x, targetX.value], Extrapolation.CLAMP);
    const y = interpolate(p, [0, 1], [start.y, targetY.value], Extrapolation.CLAMP);

    return {
      opacity: targetOpacity.value * interpolate(p, [0, 0.12], [0.15, 1], Extrapolation.CLAMP),
      transform: [
        { translateX: x + (isTop ? dx.value : 0) },
        { translateY: y + arc + (isTop ? dy.value : 0) },
        {
          rotateZ: `${rotate + (isTop ? dx.value / 22 : 0)}deg`,
        },
        { scale },
      ],
    };
  });

  // Two faces, cross-faded at exactly edge-on rather than hidden with
  // `backfaceVisibility`. That property on a 3D-rotated view is inconsistent
  // on Android and fails by ghosting BOTH faces through each other — visible,
  // strange, and impossible to catch without the device.
  const spinStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${flip.value * 180}deg` },
    ],
  }));
  const frontStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 0 : 1,
  }));
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
      <Animated.View style={[StyleSheet.absoluteFill, isTop && spinStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.face, isTop && frontStyle]}>
          {front}
        </Animated.View>
        {isTop && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.face,
              styles.backFace,
              backStyle,
            ]}
          >
            {back}
          </Animated.View>
        )}
      </Animated.View>
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

const styles = StyleSheet.create({
  dim: { backgroundColor: COLORS.ink },
  stage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute',
    borderRadius: RADIUS['2xl'],
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.shadowWarm,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.42,
    shadowRadius: 30,
    elevation: 18,
  },
  face: { borderRadius: RADIUS['2xl'], overflow: 'hidden' },
  // The back face is counter-rotated so its content is not mirrored once the
  // container has turned 180°.
  backFace: { transform: [{ rotateY: '180deg' }] },
  shade: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS['2xl'],
    backgroundColor: COLORS.ink,
  },
});
