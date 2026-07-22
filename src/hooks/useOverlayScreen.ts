import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { OVERLAY_TRANSITION } from '@/constants/motion';
import { Handoff, OverlayKey, useUIStore } from '@/stores/uiStore';

// The route each overlay lives at. Here rather than at the call sites so the
// key that names the hand-off and the screen that receives it cannot drift.
const OVERLAY_ROUTE = {
  notifications: '/notifications',
  search: '/search',
  // Same screen, different job: the Inbox's field searches the conversations
  // you can actually open rather than every event on the map. The mode rides
  // in the URL so the route is the only thing that has to know.
  chatSearch: '/search?mode=chats',
  settings: '/profile/settings',
} as const;

/**
 * The other half: opening an overlay from the page that owns the element.
 *
 * Measures the element in window coordinates, hands the rect over, then pushes.
 * The element needs a plain wrapping `<View ref collapsable={false}>` — view
 * flattening removes an unstyled wrapper on Android, and the ref cannot go on a
 * `PressableScale`, whose host ref is not something to rely on.
 *
 * `measureInWindow` never fires for a detached node, so a missing ref falls
 * through to pushing with no hand-off rather than to a dead tap.
 */
export function useOpenOverlay() {
  const router = useRouter();

  return useCallback(
    (key: OverlayKey, ref: RefObject<View | null>) => {
      const node = ref.current;
      const { setHandoff } = useUIStore.getState();
      if (!node) {
        setHandoff(null);
        router.push(OVERLAY_ROUTE[key]);
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        setHandoff({ key, x, y, width, height });
        router.push(OVERLAY_ROUTE[key]);
      });
    },
    [router]
  );
}

/**
 * Everything a full-screen overlay needs to open and close the app's way.
 *
 * An overlay here is a route declared `presentation: 'transparentModal'` with
 * `animation: 'none'` — the page it covers stays mounted underneath, and the
 * whole transition is driven from the overlay in JS. Two screens run this:
 * notifications and search. The shapes they fly are different; the choreography
 * is identical, and lives here rather than being written twice.
 *
 * What it gives you:
 *
 *   travel   0 = the handed-over element is where it started, 1 = parked in its
 *            new home. Drive the flying element's position and size off this.
 *   content  0 = gone, 1 = arrived. Drive everything below it off this.
 *   handoff  where the element started, frozen for the life of the screen, or
 *            null if the overlay was reached without one.
 *   dismiss  play the exit, pop the route, then optionally do something.
 *
 * What it does on your behalf: tells the page underneath to recede on mount and
 * to come back at the start of the exit, and hands its element back on unmount
 * however the screen went away — `dismiss`, an Android back press, a deep link
 * rebuilding the stack.
 *
 * With the route's native animation off, nothing else would play the exit before
 * the screen was torn down, so `router.back()` runs in the flight's timing
 * callback rather than on the tap.
 */
export function useOverlayScreen() {
  const router = useRouter();

  // Frozen on mount: the element that was tapped does not move while we are
  // looking at it, and subscribing to the store would only add a re-render when
  // the open flag clears.
  const [handoff] = useState<Handoff | null>(
    () => useUIStore.getState().handoff
  );

  // Where to go once the exit has played out. Set by `dismiss`, consumed by
  // `finish`: a target on a tab, or on the page underneath, can only be reached
  // after this route is off the stack.
  const afterExit = useRef<(() => void) | null>(null);

  const finish = useCallback(() => {
    router.back();
    const next = afterExit.current;
    afterExit.current = null;
    next?.();
  }, [router]);

  const { travel, content, leave } = useTransition(finish);

  const dismiss = useCallback(
    (then?: () => void) => {
      afterExit.current = then ?? null;
      // The page underneath starts coming back now, not when the route finally
      // pops: the two halves have to overlap or they read as two separate
      // animations.
      useUIStore.getState().closeOverlay();
      leave();
    },
    [leave]
  );

  useEffect(() => {
    // Asserted here rather than by whoever pushed the route: a push tap or a
    // deep link lands on the overlay without going through the element it would
    // have taken over, and the page still has to step aside for it. Pushed the
    // normal way this is already true and setting it again changes nothing.
    useUIStore.getState().enterOverlay();
    return () => useUIStore.getState().clearOverlay();
  }, []);

  return { travel, content, handoff, dismiss };
}

/**
 * The two shared values and both directions, in one hook because they are one
 * thing. A shared value handed out and then written from a component body is
 * effect state being mutated from outside it, which is what the compiler's
 * immutability rule is there to catch.
 *
 * Two values rather than sub-ranges of one: the flight and the content start at
 * different moments and run different lengths in each direction, and hanging
 * both off a single eased value put the easing curve in charge of the
 * choreography — the exit inherited a slow start it should never have had.
 */
function useTransition(onGone: () => void) {
  const travel = useSharedValue(0);
  const content = useSharedValue(0);
  // Guards a second tap on the dismiss control mid-flight: the exit is already
  // running, and restarting it would pop the route twice.
  const leaving = useRef(false);

  // A plain function, not a useCallback: it is only ever called from a press
  // handler, and memoising it would mean handing these values to a second hook —
  // which is what turns "start an animation" into "reassign effect state" as far
  // as the compiler's immutability rule is concerned.
  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    // The content clears out first and fast. An overlay still sitting on top of
    // a page that has already come back is what makes an exit read as lag —
    // leaving has to look like leaving, not like a cross-fade.
    content.value = withTiming(0, {
      duration: OVERLAY_TRANSITION.contentOutMs,
      easing: Easing.out(Easing.quad),
    });
    // The flying element is the last thing out, and the route pops when it
    // lands, so the hand-off back happens on a page that has settled.
    travel.value = withDelay(
      OVERLAY_TRANSITION.travelOutDelayMs,
      withTiming(
        0,
        {
          duration: OVERLAY_TRANSITION.travelOutMs,
          easing: Easing.out(Easing.cubic),
        },
        (done) => {
          if (done) runOnJS(onGone)();
        }
      )
    );
  };

  // The mount animation comes after `leave` deliberately: both write the same
  // shared values, and the compiler's immutability rule only tolerates the pair
  // in this order.
  useEffect(() => {
    travel.value = withTiming(1, {
      duration: OVERLAY_TRANSITION.travelInMs,
      easing: Easing.out(Easing.cubic),
    });
    // Held back until the page beneath is most of the way gone: the content
    // should arrive on an empty stage, not through the screen it is replacing.
    content.value = withDelay(
      OVERLAY_TRANSITION.contentInDelayMs,
      withTiming(1, {
        duration: OVERLAY_TRANSITION.contentInMs,
        easing: Easing.out(Easing.cubic),
      })
    );
  }, [travel, content]);

  return { travel, content, leave };
}

/**
 * How far the scene underneath has stepped back: 0 = fully present, 1 = gone.
 *
 * Driven off the store's open flag rather than off the overlay's own values,
 * because the two things that read it live on the *other* side of the route —
 * the page beneath, and any backdrop that has to take its place.
 *
 * The two directions are not mirror images, on purpose. Going out it clears
 * quickly, so the overlay has an empty stage to arrive on. Coming back it
 * *waits* — the overlay has to be gone before the scene reappears under it, or
 * the two cross-fade through each other and you see both at once.
 */
function useSceneProgress() {
  const overlayOpen = useUIStore((s) => s.overlayOpen);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = overlayOpen
      ? withTiming(1, {
          duration: OVERLAY_TRANSITION.sceneOutMs,
          easing: Easing.out(Easing.cubic),
        })
      : withDelay(
          OVERLAY_TRANSITION.sceneReturnDelayMs,
          withTiming(0, {
            duration: OVERLAY_TRANSITION.sceneReturnMs,
            easing: Easing.out(Easing.cubic),
          })
        );
  }, [overlayOpen, progress]);

  return progress;
}

/**
 * The page an overlay is covering. Returns a style to put on everything that
 * should step back — it lifts, shrinks a touch and dissolves, leaving the
 * app's backdrop for the overlay to arrive on. The page stays mounted the whole
 * time (these routes are transparent), so this is a flag rather than an
 * unmount.
 *
 * Put it on what scrolls, not on the whole screen: a sheet or a modal that
 * shrank with the page would be a modal that isn't quite modal.
 */
export function useOverlayRecede() {
  const progress = useSceneProgress();

  return useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { scale: 1 - progress.value * 0.06 },
      { translateY: -progress.value * 14 },
    ],
  }));
}

/**
 * For an overlay opening over an **opaque** page: the backdrop it has to bring
 * with it, fading in exactly as that page recedes.
 *
 * Most overlays need nothing here. Tab screens run transparent over the one
 * `<AppBackground>` mounted behind the navigator, so when home dissolves the
 * app's own living backdrop is simply revealed. The profile tab is the
 * exception — it paints `accent` as its floor so the user's photo can cover the
 * screen — and an overlay over it was landing its light glass and ink text on
 * near-black.
 *
 * Wrap an `<AppBackground>` in this and put it at the bottom of the overlay.
 * It has to *fade*: opaque from the first frame it would hide the page before
 * the page had a chance to step back, and the recede is the part you watch.
 */
export function useOverlayBackdrop() {
  const progress = useSceneProgress();

  return useAnimatedStyle(() => ({ opacity: progress.value }));
}

/**
 * Which of this page's elements an overlay is currently holding, if any.
 *
 * That one element goes fully invisible — not faded with the rest of the page,
 * *hidden* — for as long as the overlay exists, because the overlay is drawing
 * the same element itself and flying it across. Two copies of one object, one
 * of them mid-fade, is exactly what a hand-off must never look like. Everything
 * else just recedes.
 */
export function useHandedOver(): OverlayKey | undefined {
  return useUIStore((s) => (s.overlayMounted ? s.handoff?.key : undefined));
}
