import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/constants/colors';
import { RADIUS, SPACING } from '@/constants/spacing';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { useUIStore } from '@/stores/uiStore';
import { useEventCard } from '@/hooks/useEventCard';
import { useSwipeDeck, useRecordSwipe, useSwipeQuota } from '@/hooks/useSwipeDeck';
import { shareEvent } from '@/utils/shareEvent';
import { SafetyPopup } from '@/components/safety';
import {
  Button,
  DEALT_CARD_ASPECT,
  DEALT_CARD_WIDTH_RATIO,
  FlipHint,
  useTabBarInset,
} from '@/components/ui';
import {
  FLIP_MS,
  PROMOTE_MS,
  STACK_DEPTH,
  isPastThreshold,
} from '@/components/ui/dealtCardGeometry';
import type { ExploreEvent, NearbyEvent, EventParticipant } from '@/types/models';
import { EventCard } from './EventCard';
import { EventCardBack } from './EventCardBack';
import { CardPortal } from './EventDealtCard';
import { DeckActions, DeckCounter } from './DeckChrome';
import { DeckEmptyCard, type DeckEmptyReason } from './DeckEmptyCard';
import { MINI_W, FAN_W, deckVisible, expandedSlot, miniSlot } from './deckSlots';

/**
 * The event deck: the fan in the map's bottom-left corner AND the open swipe
 * deck, as one component with two sizes.
 *
 * They used to be two things — `SwipeDeckTeaser` measured itself, hid, and a
 * `DealtCard` dealt a *different* set of cards out of the coordinates it had
 * measured. Six rounds of tuning went into making that hand-off look
 * continuous and it never did, because on the first frame there genuinely were
 * two different elements on screen. Here each card is one element that never
 * unmounts and simply moves between a small slot (`miniSlot`) and a large one
 * (`expandedSlot`), so the transition is a single interpolation on one shared
 * value.
 *
 * THE THING TO NOT ADD: there is no per-card stagger and no arc on the expand.
 * One object changes size. A stagger is precisely the illusion this component
 * exists to stop needing — if the growth ever "looks better" with one, the fix
 * is somewhere else.
 *
 * See docs/superpowers/specs/2026-08-04-event-deck-one-component-design.md.
 */

// The card's full size, shared with the map pin's dealt card so the two
// surfaces are the same object at the same scale.
const CARD_WIDTH_RATIO = DEALT_CARD_WIDTH_RATIO;
const CARD_ASPECT = DEALT_CARD_ASPECT;

// Where the parked fan sits: `left` and the tuck under the floating tab bar,
// both carried over verbatim from SwipeDeckTeaser so the fan does not move
// when this replaces it.
const FAN_LEFT = 4;
const TUCK = 26;
// Headroom above the cards inside the fan's tap target, for the "Up for it?"
// pill and the count badge — the teaser's 138pt box minus its 110pt cards.
const FAN_LABEL_ROOM = 28;

// The parked card's corner and its white edge, in *rendered* points. Both are
// divided by the mini scale before use, because they are applied to the
// full-size card and then scaled down with it.
const MINI_RADIUS = RADIUS.md;
const MINI_BORDER = 2.5;

// How dark the world goes behind the open deck. Same value as `DealtCard`'s —
// the two surfaces dim to the same level on purpose.
const DIM_OPACITY = 0.9;

const EXPAND_MS = 420;
const MINIMIZE_MS = 300;

// The glass pane arrives over the last third of the growth (design §4), so the
// card is nearly full size before there is any text on it to read.
const EMERGE_START = 0.66;

// How close to the end of the live deck we get before asking for another page.
// The deck consumes itself (a swiped card leaves `useSwipeDeck().deck`), so
// "the current index" is always 0 and "within 5 of the end" is a length test.
const PREFETCH_AHEAD = 5;

// How far a finger may travel and still count as a tap. Matches `DealtCard`.
const TAP_SLOP = 10;

const CARD_SHADOW_OPACITY = 0.42;
const CARD_ELEVATION = 18;

// The parked fan's placeholder faces when there is nothing to swipe — carried
// over from SwipeDeckTeaser, which showed these rather than vanishing, so the
// entry point is always in the same place.
const CAUGHT_UP_EMOJI = ['✨', '🎉', '👀'];

// The deck's five haptic moments, matching the design's table: a selection
// tick when you open it, a heavier thud when it lands, a light click as the
// card passes edge-on through a flip, a selection tick the instant a swipe
// crosses the threshold, and the success notification only on a save — a pass
// is not a success, and the threshold tick already said the swipe took.
function haptic(kind: 'expand' | 'land' | 'flip' | 'threshold' | 'save') {
  if (kind === 'expand') Haptics.selectionAsync();
  else if (kind === 'land') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  else if (kind === 'flip') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else if (kind === 'threshold') Haptics.selectionAsync();
  else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/**
 * The deck, or nothing.
 *
 * Split in two so that `useSwipeDeck`'s queries — the explore feed, the
 * swiped-id list, the day's swipe count — only run where the deck can actually
 * be seen. This component is mounted in the root layout, so a single component
 * calling that hook above its own visibility check would run the whole feed on
 * every screen in the app.
 */
export function EventDeck() {
  const pathname = usePathname();
  const creatingEvent = useUIStore((s) => s.creatingEvent);
  const overlayOpen = useUIStore((s) => s.overlayOpen);
  const [expanded, setExpanded] = useState(false);

  // Not a nicety — a constraint. `CardPortal` puts this in a
  // `FullWindowOverlay`, which attaches to the key window the moment it mounts
  // and therefore sits above modal routes, the create-event flow and every
  // pushed screen. The parked fan lives in that portal, so an overlay is
  // mounted for as long as the fan shows, and the fan has to get out of the
  // way of anything that takes the screen. Nothing in `tsc` or the test suite
  // can see this going wrong; `deckVisible` is a pure function precisely so
  // the rule itself is testable.
  if (
    !deckVisible({
      onMap: pathname === '/map',
      creatingEvent,
      overlayOpen,
      expanded,
    })
  ) {
    return null;
  }

  return <DeckBody expanded={expanded} setExpanded={setExpanded} />;
}

function DeckBody({
  expanded,
  setExpanded,
}: {
  expanded: boolean;
  setExpanded: (next: boolean) => void;
}) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const tabBarInset = useTabBarInset();

  const cardW = Math.round(width * CARD_WIDTH_RATIO);
  const cardH = Math.round(cardW * CARD_ASPECT);

  // The live deck, not a snapshot of ids. `useSwipeDeck` filters out anything
  // in the swiped-id cache, and `useRecordSwipe` writes that cache
  // optimistically — so a swiped card leaves this list by itself and the next
  // card is always `deck[0]`. That is what lets pages loaded mid-session join
  // the deck you are already holding, which the old id-snapshot could not do.
  const { deck, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSwipeDeck();
  const { outOfSwipes } = useSwipeQuota();
  const recordSwipe = useRecordSwipe();

  // Ask for the next page while there is still a hand left to swipe, so the
  // deck never visibly runs out mid-gesture. Re-runs as the deck shortens; a
  // page whose rows are all filtered out (already swiped, too far, your own)
  // simply triggers the next one, and it stops when `hasNextPage` goes false.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && deck.length <= PREFETCH_AHEAD) {
      fetchNextPage();
    }
  }, [deck.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Why there is nothing to swipe. Out of swipes is checked FIRST: the cap is
  // the reason you cannot see the rest, and telling someone they are all
  // caught up while a queue sits behind a paywall would be a lie. `error` is
  // checked before `caughtUp` rather than after it (the order the brief lists)
  // because a failed load also produces an empty deck — checking it second
  // would make the branch unreachable and every network failure read as "come
  // back later".
  const emptyReason: DeckEmptyReason | null = outOfSwipes
    ? 'outOfSwipes'
    : isError && deck.length === 0
      ? 'error'
      : deck.length === 0
        ? 'caughtUp'
        : null;

  const topRow: ExploreEvent | undefined = emptyReason ? undefined : deck[0];
  const topId = topRow?.id ?? null;

  // The full detail behind the top card — the join gate, the CTA, the roster
  // on the back. Only while the deck is open: the parked fan is a photo, and
  // fetching an event detail (plus its distance query) for a card nobody has
  // tapped would run on every map session.
  const {
    event: detail,
    gate,
    primaryLabel,
    onPrimary,
    queue,
    confirmQueued,
    dismissQueue,
    saved,
    toggleSave,
  } = useEventCard(expanded ? topId : null);
  const cardEvent: (NearbyEvent & { participants?: EventParticipant[] }) | undefined =
    detail?.id === topId ? detail : topRow;

  // 0 = parked in the corner, 1 = open on screen. Everything else on this
  // surface is a read of this one value.
  const expand = useSharedValue(0);
  // 0 = front, 1 = back. Top card only.
  const flip = useSharedValue(0);
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  // The parked fan's breathing. Multiplied by (1 - expand) below, so it stops
  // as soon as the deck starts opening.
  const sway = useSharedValue(0);

  // Which face is MOUNTED, as opposed to which way the card is facing. Swapped
  // at the edge-on crossing — see the flip gesture for why one face at a time
  // rather than two cross-faded.
  const [backMounted, setBackMounted] = useState(false);

  // The single interpolation. `expanded` drives it from an effect rather than
  // from the press handler so that `expand` is written in exactly one place:
  // React's immutability rule (warn-level here, see eslint.config.js) fires on
  // any other write to a shared value an effect already touches, and the
  // alternative — writing it from handlers and reacting to it with
  // `useAnimatedReaction` — costs a warning per call site for no behaviour.
  useEffect(() => {
    expand.value = withTiming(
      expanded ? 1 : 0,
      {
        duration: expanded ? EXPAND_MS : MINIMIZE_MS,
        // Moves off decisively and settles. No overshoot: an object growing
        // into place is not the same gesture as a card being thrown.
        easing: expanded
          ? Easing.bezier(0.22, 0.7, 0.28, 1)
          : Easing.bezier(0.4, 0, 0.7, 0.4),
      },
      (done) => {
        if (done && expanded) runOnJS(haptic)('land');
      }
    );
  }, [expanded, expand]);

  useEffect(() => {
    sway.value = withDelay(
      1500,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      )
    );
  }, [sway]);

  const open = useCallback(() => {
    haptic('expand');
    setExpanded(true);
  }, [setExpanded]);

  const minimize = useCallback(() => {
    setExpanded(false);
    setBackMounted(false);
  }, [setExpanded]);

  // Records the swipe and lets the live deck drop the card. The quota guard is
  // belt-and-braces rather than a route to the paywall: `outOfSwipes` turns
  // the whole deck into `DeckEmptyCard`'s paywall face on the very render it
  // becomes true, so there is no card left to swipe past the cap — and pushing
  // a route from in here would put the paywall UNDER this component's own
  // window layer (see `CardPortal`).
  const commitSwipe = useCallback(
    (direction: 'like' | 'pass') => {
      if (!topId || outOfSwipes) return;
      recordSwipe(topId, direction);
    },
    [topId, outOfSwipes, recordSwipe]
  );

  const handleToggleSave = useCallback(() => {
    toggleSave();
  }, [toggleSave]);

  // "View host profile" — the one safety popup with a navigation side effect.
  // The deck has to come home first: it is in a window-level overlay, so a
  // pushed profile would render underneath it.
  const handleViewHostProfile = useCallback(() => {
    if (!cardEvent) return;
    dismissQueue();
    minimize();
    router.push(`/friends/${cardEvent.host_id}`);
  }, [cardEvent, dismissQueue, minimize, router]);

  // ─── The top card's gestures ───────────────────────────────────────────────

  // Set the instant a commit or a drag-down minimize is kicked off, so the
  // `onFinalize` below does not re-snap on top of an animation already
  // running. RNGH force-ends an ACTIVE pan when it is disabled mid-drag, and
  // that termination path skips `onEnd` entirely — which is why the neutral
  // reset lives in `onFinalize` (guaranteed on every termination) rather than
  // in `onEnd`. Getting this wrong leaves the card frozen at a stale offset.
  const settling = useSharedValue(false);
  // Fires the threshold tick once, the moment the swipe first takes — while
  // the finger is still down, so you feel that it will commit before you let
  // go. Falling back under the line re-arms it.
  const thresholdArmed = useSharedValue(true);

  // A plain function, deliberately NOT a `useCallback`: putting `dx`/`dy`/
  // `flip` in a dependency array passes them as arguments to a hook, and
  // React's immutability rule then flags every later write to them anywhere in
  // this component — eight warnings for a memo nothing needs, since the
  // gesture objects below are rebuilt each render regardless. `DealtCard`'s
  // equivalent (`commit`) is a plain function for the same reason.
  function flingOff(direction: 1 | -1) {
    if (direction === 1) haptic('save');
    dx.value = withTiming(direction * width * 1.4, { duration: 300 }, (done) => {
      if (done) {
        dx.value = 0;
        dy.value = 0;
        flip.value = 0;
        runOnJS(setBackMounted)(false);
        runOnJS(commitSwipe)(direction === 1 ? 'like' : 'pass');
      }
    });
  }

  // Axis gating, not an on/off switch, so pass/save works on BOTH faces.
  //
  //   • horizontal always activates — that is pass/save, and it means the same
  //     thing whichever way the card is facing.
  //   • on the FRONT, vertical activates too: drag down to send the deck home,
  //     up rubber-bands.
  //   • on the BACK, vertical *fails* the pan and hands the stream to the
  //     back's own ScrollView. Disabling the pan wholesale on the back is what
  //     previously fixed the scroll and cost the swipe entirely.
  //
  // The horizontal threshold doubles as tap protection: a press that never
  // travels 12pt cannot start a pan, so a button on the card is not competing
  // with a gesture that already claimed the touch.
  const pan = (
    backMounted
      ? Gesture.Pan().activeOffsetX([-12, 12]).failOffsetY([-10, 10])
      : Gesture.Pan().activeOffsetX([-12, 12]).activeOffsetY([-12, 12])
  )
    .enabled(expanded)
    .onStart(() => {
      settling.value = false;
      thresholdArmed.value = true;
    })
    .onUpdate((e) => {
      dx.value = e.translationX;
      // Up rubber-bands: it has no job, and letting it travel freely would
      // imply it does.
      dy.value = e.translationY < 0 ? e.translationY * 0.25 : e.translationY;

      const past = isPastThreshold(e.translationX, e.velocityX, width);
      if (past && thresholdArmed.value) {
        thresholdArmed.value = false;
        runOnJS(haptic)('threshold');
      } else if (!past) {
        thresholdArmed.value = true;
      }
    })
    .onEnd((e) => {
      if (isPastThreshold(e.translationX, e.velocityX, width)) {
        settling.value = true;
        runOnJS(flingOff)(e.translationX > 0 ? 1 : -1);
        return;
      }
      // A decisive downward drag sends the deck HOME rather than closing it.
      // The deck has a corner to go back to; dismissing it outright would
      // throw away the only thing that makes it an object rather than a modal.
      if (e.translationY > height * 0.18 || e.velocityY > 1100) {
        settling.value = true;
        dx.value = withTiming(0, { duration: 160 });
        dy.value = withTiming(0, { duration: 160 });
        runOnJS(minimize)();
        return;
      }
    })
    .onFinalize(() => {
      if (settling.value) {
        settling.value = false;
        return;
      }
      dx.value = withTiming(0, { duration: 220 });
      dy.value = withTiming(0, { duration: 220 });
    });

  // `maxDistance` matters: without it a slow drag that ended under the swipe
  // threshold still satisfied the tap and flipped the card — a flip you did
  // not ask for, out of a gesture you meant as a swipe.
  //
  // Carried over unresolved from `DealtCard`: this tap covers the whole card
  // including every `Pressable` on it, and RNGH cancels React Native's
  // in-flight touches when a gesture activates. A Pan only activates once you
  // move, so it costs presses nothing; a Tap activates on the same tap-up a
  // `Pressable` would fire `onPress` on, and which wins depends on UIKit's
  // delivery order. Section O of docs/testing/dealt-event-card.md is the row
  // that settles it for the pin's card, and it settles this one too.
  const tap = Gesture.Tap()
    .enabled(expanded)
    .maxDuration(400)
    .maxDistance(TAP_SLOP)
    .onEnd(() => {
      const next = flip.value > 0.5 ? 0 : 1;
      // Two legs meeting at 0.5 rather than one timing plus a
      // `useAnimatedReaction` watching for the crossing: the callback between
      // them lands EXACTLY edge-on, where the card is a line and nothing is
      // visible to pop, instead of on whichever frame the reaction happened to
      // sample. That crossing is where the face is swapped — one face mounted
      // at a time, NOT two cross-faded and not `backfaceVisibility`. Two
      // coplanar faces under a real 3D rotation z-fight into a hard seam down
      // the rotation axis, and an opacity of 0 does not take a layer out of
      // that fight.
      flip.value = withSequence(
        withTiming(
          0.5,
          { duration: FLIP_MS / 2, easing: Easing.in(Easing.quad) },
          (done) => {
            if (done) {
              runOnJS(haptic)('flip');
              runOnJS(setBackMounted)(next === 1);
            }
          }
        ),
        withTiming(next, { duration: FLIP_MS / 2, easing: Easing.out(Easing.quad) })
      );
    });

  const gesture = Gesture.Exclusive(pan, tap);

  // ─── Slots ────────────────────────────────────────────────────────────────

  // The parked fan's position, expressed the way the open stack already is:
  // as an offset from screen centre, because that is where the cards are laid
  // out. Nothing is measured at tap time any more — the corner is a number.
  const miniScale = MINI_W / cardW;
  const miniCentreX = FAN_LEFT + FAN_W / 2 - width / 2;
  // The card's own scaled height, not the fan's nominal one: `miniSlot` scales
  // by width and the card's aspect is fixed, so this is what actually sits in
  // the corner and this is what has to have its bottom edge tucked under the
  // tab bar.
  const miniCardH = cardH * miniScale;
  const fanBottom = tabBarInset - TUCK;
  const miniCentreY = height - fanBottom - miniCardH / 2 - height / 2;

  // ─── Faces ────────────────────────────────────────────────────────────────

  const showChrome = !emptyReason;

  const rows = emptyReason ? [] : deck.slice(0, STACK_DEPTH + 2);
  const layers: {
    key: string;
    front: (emerge: SharedValue<number>) => ReactNode;
    back: ReactNode;
  }[] = emptyReason
    ? CAUGHT_UP_EMOJI.map((emoji, i) => ({
        key: `empty-${emoji}`,
        front: (emerge: SharedValue<number>) => (
          <EmptyFace
            emerge={emerge}
            emoji={emoji}
            // Only the top card carries the message. The two behind it are
            // the fan still being a fan — a stack of three identical "all
            // caught up" cards would read as a rendering fault.
            reason={i === 0 ? emptyReason : null}
          />
        ),
        back: null,
      }))
    : rows.map((row, i) => ({
        key: row.id,
        front: (emerge: SharedValue<number>) =>
          i === 0 ? (
            <EventCard
              event={cardEvent ?? row}
              blurred
              emerge={emerge}
              action={
                primaryLabel ? (
                  <Button
                    label={primaryLabel}
                    // The deck comes home before any of these navigate: it
                    // lives in a window-level overlay, so a pushed route would
                    // render underneath it. `onPrimary` closes the *dealt
                    // card* (a different surface) and knows nothing about us.
                    onPress={() => {
                      minimize();
                      onPrimary();
                    }}
                    fullWidth
                    size="md"
                    variant={
                      gate === 'full' || gate === 'womenOnly' || gate === 'pending'
                        ? 'tertiary'
                        : 'primary'
                    }
                    disabled={gate === 'full' || gate === 'womenOnly'}
                  />
                ) : undefined
              }
              onSave={handleToggleSave}
              onShare={() => shareEvent(cardEvent ?? row)}
              saved={saved}
            />
          ) : (
            // Background cards pay for no BlurView: five real ones is a
            // measurable iOS cost and only the top card is being read.
            <EventCard event={row} blurred={false} emerge={emerge} />
          ),
        back:
          i === 0 && detail?.id === row.id ? (
            <EventCardBack
              event={detail}
              isMember={gate === 'none'}
              tooFar={gate === 'premiumDistance'}
              // No secondary actions here on purpose. Leave / check in /
              // approve all open a `Dialog` or `Sheet`, and a `Modal`
              // presented from inside `CardPortal`'s overlay is a silent
              // no-op (see that component's comment). They belong to the
              // pin's dealt card, which is the surface for an event you are
              // already in; the deck is for events you are deciding about.
            />
          ) : null,
      }));

  // Every animated style is built HERE, above the one early return and out of
  // the JSX. Called from inside a ternary or after `return null` they would be
  // conditional hooks: React identifies hooks by call order, so a render that
  // skipped one would hand the next hook the previous one's state. The header
  // and footer each get their own — one `useAnimatedStyle` result is bound to
  // one view and must not be shared across two.
  const dimStyle = useDimStyle(expand);
  const headerStyle = useChromeStyle(expand);
  const footerStyle = useChromeStyle(expand);
  const hintStyle = useChromeStyle(expand);
  const fanChromeStyle = useFanChromeStyle(expand, sway);

  if (isLoading) return null;

  const parkedLabel =
    emptyReason === 'outOfSwipes'
      ? 'Out of swipes'
      : emptyReason === 'error'
        ? 'Tap to retry'
        : emptyReason
          ? 'All caught up'
          : 'Up for it?';

  return (
    <>
      <CardPortal>
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* The dim gets its own wrapper and the stage an explicit zIndex
              above it, because the two fight over DEPTH rather than paint
              order: the card's transform carries a `perspective`, so as it
              flips the half turning away moves to negative z and a flat dim
              plane that is a sibling gets depth-sorted OVER it — a hard band
              down the rotation axis. The wrapper gives the dim its own
              compositing context; the zIndex maps to `zPosition` on iOS. */}
          <View style={styles.dimWrap} pointerEvents="box-none">
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.dim, dimStyle]}
              // Never a tap target while parked, or the whole map stops
              // responding behind a fully transparent view.
              pointerEvents={expanded ? 'auto' : 'none'}
              onTouchEnd={minimize}
            />
          </View>

          <View style={styles.stage} pointerEvents="box-none">
            {/* Deepest first, so paint order falls out of DOM order.
                STACK_DEPTH + 2: the extra layer is the one parked at opacity 0
                on `stackLayer`'s deeper branch, so a shortening stack always
                has a card already mounted to fade in rather than one appearing
                from nothing. */}
            {layers
              .map((c, depth) => ({ c, depth }))
              .reverse()
              .map(({ c, depth }) => (
                <DeckCardLayer
                  key={c.key}
                  depth={depth}
                  cardW={cardW}
                  cardH={cardH}
                  expand={expand}
                  flip={flip}
                  dx={dx}
                  dy={dy}
                  sway={sway}
                  miniCentreX={miniCentreX}
                  miniCentreY={miniCentreY}
                  miniScale={miniScale}
                  front={c.front}
                  back={c.back}
                  backMounted={backMounted}
                  gesture={depth === 0 ? gesture : null}
                />
              ))}
          </View>

          {/* The open deck's furniture. Mounted whether or not the deck is
              open — it rides `expand` like everything else, so it fades with
              the growth rather than appearing when the animation ends — but
              never a tap target while parked. */}
          {showChrome && (
            <>
              <Animated.View
                style={[styles.header, headerStyle]}
                pointerEvents={expanded ? 'box-none' : 'none'}
              >
                <DeckCounter />
              </Animated.View>
              <Animated.View
                style={[styles.footer, footerStyle]}
                pointerEvents={expanded ? 'box-none' : 'none'}
              >
                <DeckActions
                  onPass={() => flingOff(-1)}
                  onSave={() => flingOff(1)}
                  disabled={!topId}
                />
              </Animated.View>
            </>
          )}

          {/* "Tap for details" — `DealtCard`'s own hint, lifted out and
              exported rather than rebuilt here: the deck's top card has a back
              face for exactly the same reason a single dealt card does (design
              doc §2), and it is the same fact about the same kind of surface.
              Gated on there actually being a back to turn to (an event whose
              detail hasn't loaded yet has none) and on the front currently
              showing — flipping it back on while the back is up would have it
              advertise the face already on screen. Fades with the rest of the
              chrome rather than popping in with `showChrome` alone. */}
          {showChrome && !backMounted && layers[0]?.back != null && (
            <Animated.View
              style={[styles.hintChrome, hintStyle]}
              pointerEvents="none"
            >
              <FlipHint bottom={height / 2 + cardH / 2 + SPACING[4]} />
            </Animated.View>
          )}

          {/* The fan's tap target and its label, over the parked cards.
              Unmounted the moment the deck opens, so it can never swallow a
              touch meant for the open deck. A plain `Pressable` rather than
              `PressableScale`: the thing that should react to the press is the
              stack of cards, which is not inside this view — and the expand
              itself, with its selection tick, is the feedback. */}
          {!expanded && (
            <Animated.View
              style={[
                styles.fanChrome,
                {
                  left: FAN_LEFT,
                  bottom: fanBottom,
                  width: FAN_W,
                  height: miniCardH + FAN_LABEL_ROOM,
                },
                fanChromeStyle,
              ]}
              pointerEvents="box-none"
            >
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={open}
                accessibilityRole="button"
                accessibilityLabel={
                  emptyReason
                    ? `Open the event deck — ${parkedLabel.toLowerCase()}`
                    : `Swipe through ${deck.length} events near you`
                }
              />
              {!emptyReason && (
                <View style={styles.countBadge} pointerEvents="none">
                  <Text style={styles.countText}>
                    {deck.length > 9 ? '9+' : deck.length}
                  </Text>
                </View>
              )}
              <View style={styles.labelPill} pointerEvents="none">
                <Text style={styles.labelText}>{parkedLabel}</Text>
              </View>
            </Animated.View>
          )}
        </View>
      </CardPortal>

      {/* Outside the portal: `SafetyPopup` is `Modal`-based, and a `Modal`
          presented from inside a `FullWindowOverlay` never opens — the
          responder-chain walk for a view controller returns nil. Without this
          rendered at all, tapping Join on a flagged event would populate the
          queue and then appear to do nothing. */}
      {queue[0] && (
        <SafetyPopup
          visible
          icon={queue[0].icon}
          accent={queue[0].accent}
          tint={queue[0].tint}
          title={queue[0].title}
          body={queue[0].body}
          primaryLabel={queue[0].primaryLabel}
          onPrimary={confirmQueued}
          secondaryLabel={queue[0].secondaryLabel}
          onSecondary={queue[0].secondaryLabel ? handleViewHostProfile : undefined}
          onClose={dismissQueue}
        />
      )}
    </>
  );
}

// Small named hooks rather than inline `useAnimatedStyle` calls in the JSX,
// so the rules-of-hooks lint can see they are unconditional.
function useDimStyle(expand: SharedValue<number>) {
  return useAnimatedStyle(() => ({ opacity: expand.value * DIM_OPACITY }));
}

function useChromeStyle(expand: SharedValue<number>) {
  // Arrives with the pane rather than with the movement: chrome that is
  // already legible while the cards are still small reads as a second thing
  // appearing.
  return useAnimatedStyle(() => ({
    opacity: interpolate(
      expand.value,
      [EMERGE_START, 1],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));
}

function useFanChromeStyle(expand: SharedValue<number>, sway: SharedValue<number>) {
  return useAnimatedStyle(() => ({
    opacity: interpolate(expand.value, [0, 0.25], [1, 0], Extrapolation.CLAMP),
    transform: [{ rotate: `${(sway.value * 3 - 1.5) * (1 - expand.value)}deg` }],
  }));
}

/**
 * One card, at whatever size `expand` says.
 *
 * It never unmounts across the transition and its photo never swaps: the same
 * element is in the corner and on the screen. Position, rotation and scale are
 * one interpolation between two slots — no stagger, no arc, no per-card delay.
 */
function DeckCardLayer({
  depth,
  cardW,
  cardH,
  expand,
  flip,
  dx,
  dy,
  sway,
  miniCentreX,
  miniCentreY,
  miniScale,
  front,
  back,
  backMounted,
  gesture,
}: {
  depth: number;
  cardW: number;
  cardH: number;
  expand: SharedValue<number>;
  flip: SharedValue<number>;
  dx: SharedValue<number>;
  dy: SharedValue<number>;
  sway: SharedValue<number>;
  miniCentreX: number;
  miniCentreY: number;
  miniScale: number;
  front: (emerge: SharedValue<number>) => ReactNode;
  back: ReactNode;
  backMounted: boolean;
  gesture: ReturnType<typeof Gesture.Exclusive> | null;
}) {
  const isTop = depth === 0;

  const mini = miniSlot(depth, cardW, cardH);
  // Passed to the worklets as plain numbers, not as the slot object: a fresh
  // object every render would rebuild the animated style every render.
  const miniX = miniCentreX + mini.x;
  const miniY = miniCentreY + mini.y;
  const miniRotate = mini.rotate;

  // The open slot, as animated targets rather than a direct read of
  // `expandedSlot(depth)`. When the card above this one is swiped away, this
  // card's depth changes — and the transform recomputing instantly from the
  // new slot would snap every card behind the top one into place the moment
  // the swipe lands. Seeded at mount to the slot's own values so the first
  // expand is unopposed.
  const layer = expandedSlot(depth);
  const openX = useSharedValue(layer.x);
  const openY = useSharedValue(layer.y);
  const openRotate = useSharedValue(layer.rotate);
  const openScale = useSharedValue(layer.scale);
  const openOpacity = useSharedValue(layer.opacity);
  const openShade = useSharedValue(depth === 0 ? 0 : 0.18);

  // Guards the first run: a depth prop exists at mount too, and that is not a
  // promotion.
  const mountedDepth = useRef(depth);
  useEffect(() => {
    if (mountedDepth.current === depth) return;
    mountedDepth.current = depth;
    const next = expandedSlot(depth);
    openX.value = withTiming(next.x, { duration: PROMOTE_MS });
    openY.value = withTiming(next.y, { duration: PROMOTE_MS });
    openRotate.value = withTiming(next.rotate, { duration: PROMOTE_MS });
    openScale.value = withTiming(next.scale, { duration: PROMOTE_MS });
    openOpacity.value = withTiming(next.opacity, { duration: PROMOTE_MS });
    openShade.value = withTiming(depth === 0 ? 0 : 0.18, { duration: PROMOTE_MS });
  }, [depth, openOpacity, openRotate, openScale, openShade, openX, openY]);

  // Per card, derived on the UI thread from the shared `expand` — never a JS
  // number recomputed per frame, which would re-render every card's host row,
  // title and going count for a fade only the glass pane needs.
  const emerge = useDerivedValue(() =>
    interpolate(expand.value, [EMERGE_START, 1], [0, 1], Extrapolation.CLAMP)
  );

  const boxStyle = useAnimatedStyle(() => {
    const e = expand.value;
    const flipValue = isTop ? flip.value : 0;
    const x = interpolate(e, [0, 1], [miniX, openX.value], Extrapolation.CLAMP);
    const y = interpolate(e, [0, 1], [miniY, openY.value], Extrapolation.CLAMP);
    const scale = interpolate(
      e,
      [0, 1],
      [miniScale, openScale.value],
      Extrapolation.CLAMP
    );
    const rotate =
      interpolate(e, [0, 1], [miniRotate, openRotate.value], Extrapolation.CLAMP) +
      // The fan's breath, on its way out as the deck opens.
      (sway.value * 3 - 1.5) * (1 - e);

    // The shadow has to fade through the turn. A shadow is drawn from the
    // layer's own rectangle, and a 3D rotation foreshortens the card without
    // narrowing that rectangle — so from ~30° on it spills past both edges as
    // two dark bands, worst edge-on where the card is a sliver and its shadow
    // is still full width. sin() is 0 at both rest positions and 1 at 90°,
    // which is exactly the shape of the problem.
    const shadow = 1 - Math.sin(flipValue * Math.PI);

    return {
      opacity: interpolate(
        e,
        [0, 1],
        [mini.opacity, openOpacity.value],
        Extrapolation.CLAMP
      ),
      shadowOpacity: CARD_SHADOW_OPACITY * shadow,
      // Android draws no shadow from `shadowOpacity`; `elevation` is its knob
      // and it has the same spill.
      elevation: CARD_ELEVATION * shadow,
      // The corner is applied at full card size and then scaled down with the
      // card, so the parked value is divided by the mini scale to come out at
      // MINI_RADIUS on screen.
      borderRadius: interpolate(
        e,
        [0, 1],
        [MINI_RADIUS / miniScale, RADIUS['2xl']],
        Extrapolation.CLAMP
      ),
      // `perspective` first, and the whole lot on the CARD — not on an inner
      // wrapper. With the rotateY one view further in, the card's own fill,
      // radius and shadow sit perfectly still while the contents spin, and the
      // flip reads as a cross-fade inside a static box.
      transform: [
        { perspective: 1200 },
        { translateX: x + (isTop ? dx.value : 0) },
        { translateY: y + (isTop ? dy.value : 0) },
        { rotateZ: `${rotate + (isTop ? dx.value / 22 : 0)}deg` },
        { rotateY: `${flipValue * 180}deg` },
        { scale },
      ],
    };
  });

  const faceStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(
      expand.value,
      [0, 1],
      [MINI_RADIUS / miniScale, RADIUS['2xl']],
      Extrapolation.CLAMP
    ),
  }));

  // No CSS filter in React Native, so "dimmer the further back" is a real
  // overlay. Always mounted so it can animate rather than pop when a promotion
  // crosses the top-card boundary, and multiplied by `expand` because the fan
  // has no stack to shade — its cards are simply behind each other.
  const shadeStyle = useAnimatedStyle(() => ({
    opacity: openShade.value * expand.value,
  }));

  // The white edge that makes a parked card read as a card on the map. Fades
  // out early in the growth: the border is 2.5pt only at the mini scale, and
  // at full size it would be a fat frame.
  const frameStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expand.value, [0, 0.35], [1, 0], Extrapolation.CLAMP),
  }));

  const body = (
    <Animated.View
      style={[styles.card, { width: cardW, height: cardH }, boxStyle]}
      pointerEvents={isTop ? 'auto' : 'none'}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.face, faceStyle]}>
        {isTop && backMounted ? (
          <View style={[StyleSheet.absoluteFill, styles.backFace]}>{back}</View>
        ) : (
          <View style={StyleSheet.absoluteFill}>{front(emerge)}</View>
        )}
        <Animated.View pointerEvents="none" style={[styles.shade, shadeStyle]} />
        {/* No radius of its own — the face clips it, so the border comes out
            rounded to whatever corner the card currently has. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.miniFrame,
            { borderWidth: MINI_BORDER / miniScale },
            frameStyle,
          ]}
        />
      </Animated.View>
    </Animated.View>
  );

  if (!gesture) return body;
  return <GestureDetector gesture={gesture}>{body}</GestureDetector>;
}

/**
 * The face of a card when there is nothing to swipe.
 *
 * Built the same way a real card is — a coloured "photo" that is all you see
 * in the corner, and the message fading in over the last third of the growth
 * with `emerge`. That is what keeps the empty state part of the same object
 * rather than a different card appearing where the fan used to be.
 */
function EmptyFace({
  emerge,
  emoji,
  reason,
}: {
  emerge: SharedValue<number>;
  emoji: string;
  reason: DeckEmptyReason | null;
}) {
  const style = useAnimatedStyle(() => ({ opacity: emerge.value }));
  return (
    <View style={styles.emptyFace}>
      {/* Sized for the FULL card and scaled down with it — an emoji sized for
          the 82pt corner would be a speck once the card fills the screen. */}
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      {reason && (
        <Animated.View style={[StyleSheet.absoluteFill, style]}>
          <DeckEmptyCard reason={reason} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dimWrap: { ...StyleSheet.absoluteFill, zIndex: 0 },
  dim: { backgroundColor: COLORS.ink },
  stage: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2 },
  // Full-screen so `FlipHint`'s own `bottom` offset — measured from the
  // stage's own centring, same as `DealtCard`'s — resolves against the whole
  // surface rather than against some smaller wrapper.
  hintChrome: { ...StyleSheet.absoluteFill, zIndex: 2 },
  card: {
    position: 'absolute',
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.shadowWarm,
    shadowOffset: { width: 0, height: 20 },
    shadowRadius: 30,
    // borderRadius, shadowOpacity and elevation are all animated — see
    // `boxStyle`.
  },
  face: { overflow: 'hidden' },
  // Counter-rotated so the back's content is not mirrored once the card has
  // turned 180°.
  backFace: { transform: [{ rotateY: '180deg' }] },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: COLORS.ink },
  miniFrame: { ...StyleSheet.absoluteFill, borderColor: COLORS.white },
  emptyFace: {
    flex: 1,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A glyph metric, not typography: this is sized so the emoji reads at about
  // 32pt once the card is scaled into the corner.
  emptyEmoji: { fontSize: 120 },
  fanChrome: { position: 'absolute', zIndex: 3 },
  countBadge: {
    position: 'absolute',
    top: 12,
    right: 8,
    minWidth: 24,
    height: 24,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING[1.5],
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.white,
  },
  labelPill: {
    position: 'absolute',
    top: 4,
    left: 0,
    height: 26,
    paddingHorizontal: SPACING[2.5],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-4deg' }],
    shadowColor: COLORS.ink,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  labelText: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textPrimary,
  },
});
