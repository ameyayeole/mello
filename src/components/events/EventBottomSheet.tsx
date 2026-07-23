import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import Animated, {
  FadeInUp,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  useDerivedValue,
  useAnimatedReaction,
  withTiming,
  Extrapolation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetFooter,
  BottomSheetBackdrop,
  useBottomSheetTimingConfigs,
  useBottomSheetInternal,
  type BottomSheetFooterProps,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  getEventDetail,
  getEventDistanceM,
  saveEvent,
  unsaveEvent,
} from '@/services/events.service';
import { useSavedEventIds } from '@/hooks/useSwipeDeck';
import { useNearbyEvents } from '@/hooks/useNearbyEvents';
import { NearbyEvent } from '@/types/models';
import { hasWrapped } from '@/services/wrap.service';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { CONFIG } from '@/constants/config';
import { isPremium, PREMIUM_GOLD, PREMIUM_GOLD_TINT } from '@/utils/premium';
import { ACTIVITY_MAP } from '@/constants/activities';
import { useEventParticipation } from '@/hooks/useEventParticipation';
import { splitEventTime, formatEventWhen } from '@/utils/time';
import { eventImageUri } from '@/utils/events';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatDistance } from '@/utils/distance';
import { neighbourhood } from '@/utils/location';
import { shareEvent } from '@/utils/shareEvent';
import {
  hasSeenSafetyFlag,
  markSafetyFlagSeen,
  isNewHost,
  isPartyActivity,
} from '@/services/safety';
import { SafetyPopup } from '@/components/safety';
import {
  ActivityGlyph,
  AttendeeStack,
  Avatar,
  Button,
  CategoryPill,
  Dialog,
  Glass,
  Icon,
  IconName,
  NavButton,
  PremiumBadge,
  PressableScale,
  SectionLabel,
  Sheet,
  Tag,
  TextField,
  VerifiedBadge,
} from '@/components/ui';
import type { Attendee } from '@/components/ui/AttendeeStack';
import { categoryStyle } from '@/constants/categoryStyle';

// A safety popup queued to show before a join goes through (spec #3/#5/#8/#10).
// Confirming one marks its flag seen and shows the next; the join fires only
// after the whole queue is confirmed. Dismissing cancels the join.
interface QueuedSafetyPopup {
  flag: string;
  title: string;
  body: string | string[];
  primaryLabel: string;
  icon?: IconName;
  accent?: string;
  tint?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

// The reasons offered when leaving. Stored verbatim in event_leave_feedback so a
// host can see why guests dropped. "Something else" invites a free-text note.
const LEAVE_REASONS = [
  "Can't make it anymore",
  'My plans changed',
  'Not comfortable / feels unsafe',
  'Something else',
] as const;

// One entry in the sheet stack. The sheet is a controlled component now
// (rendered by EventSheetStack for each stacked event id) rather than an
// imperative ref you `.open()` — that's what lets a "Happening near you" tap
// open a NEW sheet *above* this one instead of replacing it in place.
interface Props {
  eventId: string;
  // 1 = the root sheet; >1 = opened above another via "Happening near you".
  depth: number;
  // Only the topmost sheet shows a backdrop and takes gestures; a sheet with
  // another stacked on top of it is a dimmed, non-interactive peek.
  isTop: boolean;
  // Open a nested event above this one (a "Happening near you" tap).
  onPush: (eventId: string) => void;
  // This sheet's gorhom sheet closed (pan-down / backdrop / back) — the stack
  // drops this entry.
  onDismiss: () => void;
  // Leave the sheets entirely (a navigation action) — the stack clears.
  onCloseAll: () => void;
}

// Photo's resting height at the first stop — the band of photo you see below
// the grab handle before the host row. The content card sits right below it
// (marginTop BANNER_H) with CARD_PAD_TOP of breathing room.
const BANNER_H = 232;
const CARD_PAD_TOP = SPACING[4];

// At the full-screen stop the photo grows into a big portrait hero — echoing
// the profile screens, so a tapped event and a tapped person read as the same
// kind of surface. It never animates `height`: the photo is rendered at its
// full size from the start and pinned behind the content, and the white card
// slides DOWN to uncover it. See the component for why (that height animation
// was the old stutter) and for how the grow is sized to the sheet's own climb.

// How far the hero is allowed to grow PAST the point where the who's-going card
// would sit on the bottom edge. This is the one knob on the whole reveal:
//
//   0    the photo stops exactly where who's-going stays fully visible at the
//        full stop — the biggest hero that still shows who's going.
//   > 0  that many points of extra photo, clipping who's-going by the same
//        amount. It becomes a scroll-to.
//
// The photo and the content share a fixed budget (see `heroGrow` below), so
// every point given to one is taken from the other. There is no setting where
// both get bigger.
const HERO_OVERSHOOT = 0;

// How many people the card shows before it stops and defers to "See all".
const GOING_ROWS = 3;

// ── The who's-going entrance ─────────────────────────────────────────────────
// Each face slides out from behind the card's left border as its row arrives on
// screen, tilted, and unwinds to level as it lands.
//
// It is driven by where the row actually IS on screen, not by the sheet's snap
// progress. Snap progress was the first attempt and it was invisible: after the
// hero's anchor moved, the card sat ~160pt further down, and all three rows
// finished their animation below the fold — row 3 never cleared it during the
// drag at all. Worse, that was silent. Hand-tuned windows encode an assumption
// about the layout that nothing re-checks when the layout changes.
//
// Screen position is self-correcting. A row animates when it comes into view,
// whether that view arrived by dragging the sheet up or by scrolling the content
// once it's full screen — and those are the only two ways it can arrive.

// Starting tilt in degrees, unwound to level on arrival. Negative because the
// row travels rightwards: it leans back into where it came from. Mirrors the 9°
// the host-row stack tilts to as it exits right, so both halves of the hand-off
// read as one physical system.
const ROW_TILT = -8;
// How long a row takes to arrive once it has been triggered. A real duration is
// only possible because the entrance is timed rather than scrubbed — with a
// scrubber the speed was whatever the finger did, and there was no knob for
// "slower" at all.
const ROW_ENTER_MS = 420;
// The who's-going card's inner padding. Named because two things depend on it:
// the hero's anchor adds it back on to reconstruct where the card's bottom edge
// would fall (see `recomputeSnaps`), and the entrance starts a face exactly this
// far plus its own width to the left, which tucks it just behind the card's
// border.
const GOING_CARD_PAD = SPACING[3.5];
const GOING_AVATAR = 36;

// A compact card for the "happening near you" rail: photo on top with the
// category pill on it, then title + when/distance on a white body below. A
// pared-down cousin of the home screen's NearbyCard — no join/save affordances,
// since the whole card is a tap that opens the event. Text sits on white (not
// over a scrim) so it's always legible and the photo reads cleanly.
function NearbyMini({
  event,
  onPress,
}: {
  event: NearbyEvent;
  onPress: () => void;
}) {
  const activity = ACTIVITY_MAP[event.activity];
  const cat = categoryStyle(event.activity);
  // The event's own photo, or the host's face when it has none — see
  // `eventImageUri`. The glyph below is now genuinely the last resort.
  const imageUri = eventImageUri(event);
  return (
    <PressableScale style={styles.nearbyMini} onPress={onPress} scaleTo={0.97}>
      <View style={[styles.nearbyMiniImage, { backgroundColor: cat.tint }]}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            // Stable key so expo-image doesn't blank when the row recycles
            // inside the nested horizontal scroll.
            recyclingKey={event.id}
          />
        ) : (
          // Photoless event: the activity glyph on its category tint, so the
          // card reads as intentional rather than a blank/broken image.
          <View style={styles.nearbyMiniPlaceholder}>
            <ActivityGlyph
              activity={event.activity}
              size={34}
              color={cat.accent}
            />
          </View>
        )}
        <View style={styles.nearbyMiniPill}>
          <CategoryPill
            emoji={activity?.emoji ?? '📍'}
            label={activity?.label}
            color={cat.accent}
          />
        </View>
      </View>
      <View style={styles.nearbyMiniBody}>
        <Text style={styles.nearbyMiniTitle} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={styles.nearbyMiniMeta} numberOfLines={1}>
          {formatEventWhen(event.starts_at)}
          {event.distance_m != null
            ? ` · ${formatDistance(event.distance_m)}`
            : ''}
        </Text>
      </View>
    </PressableScale>
  );
}

// A row's entrance: 0 before it arrives, 1 once it has played. Everything the
// who's-going card animates hangs off this.
//
// Position decides WHEN; time drives it to COMPLETION. That split is the whole
// design, and both halves were learned the hard way.
//
// Driving progress directly from position — a scrubber — puts a row straddling
// the screen's bottom edge at partial progress and leaves it there. At rest that
// is an avatar frozen half-slid with a half-faded name beside it, which reads as
// a rendering fault rather than as an animation. Nothing about "the row is 60%
// on screen" should mean "the animation is 60% done".
//
// Driving it from the sheet's snap progress instead — the version before that —
// fired every row while it was still below the fold, so none of it was ever
// seen.
//
// So: watch where the row actually is, using four live values on the UI thread
// (the sheet's own top, the fixed photo band above the card, the card's reveal
// slide, and the content's scroll offset — that last one is what lets a row
// animate when you scroll to it at full screen). The moment any part of it
// crosses onto the screen, run a real timed animation to completion. It fires
// once and stays; scrolling away and back does not replay it.
function useRowEntrance({
  cardOffset,
  heroGrow,
  sheetProgress,
  screenH,
  y,
  h,
}: {
  cardOffset: number;
  heroGrow: number;
  sheetProgress: SharedValue<number>;
  screenH: number;
  y: number | null;
  h: number | null;
}) {
  const { animatedPosition, animatedScrollableState } = useBottomSheetInternal();
  const played = useSharedValue(0);

  const arrived = useDerivedValue(() => {
    if (y == null || h == null) return false;
    const slide = interpolate(
      sheetProgress.value,
      [0, 1],
      [0, heroGrow],
      Extrapolation.CLAMP
    );
    const top =
      animatedPosition.value +
      BANNER_H +
      slide +
      cardOffset +
      y -
      animatedScrollableState.value.contentOffsetY;
    return top < screenH;
  });

  useAnimatedReaction(
    () => arrived.value,
    (isArrived) => {
      // `=== 0` rather than `< 1` so a run already underway is never restarted
      // mid-flight by a frame that re-reads as arrived.
      if (isArrived && played.value === 0) {
        played.value = withTiming(1, {
          duration: ROW_ENTER_MS,
          easing: Easing.out(Easing.cubic),
        });
      }
    }
  );

  return played;
}

// One person in the who's-going card, sliding out from behind its left border.
//
// The avatar carries the travel and the tilt; the name and tag only fade.
// Rotating text at 10–15pt goes visibly soft on both platforms, and at three
// stacked rows the wobble reads as a rendering fault rather than momentum.
//
// It starts at exactly -(card padding + avatar), which tucks it just out of
// sight behind the card's left edge and no further — so every point of its
// travel is visible and it reads as emerging from the border rather than flying
// in. Card-relative, so it is the same motion on a 375pt screen and a 430pt one.
function GoingRow({
  person,
  isHost,
  cardOffset,
  heroGrow,
  sheetProgress,
  screenH,
  onLayout,
}: {
  person: Attendee;
  isHost: boolean;
  cardOffset: number;
  heroGrow: number;
  sheetProgress: SharedValue<number>;
  screenH: number;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const [box, setBox] = useState<{ y: number; h: number } | null>(null);
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { y, height: h } = e.nativeEvent.layout;
      setBox((prev) => (prev?.y === y && prev?.h === h ? prev : { y, h }));
      onLayout?.(e);
    },
    [onLayout]
  );

  const entrance = useRowEntrance({
    cardOffset,
    heroGrow,
    sheetProgress,
    screenH,
    y: box?.y ?? null,
    h: box?.h ?? null,
  });

  const avatarStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          entrance.value,
          [0, 1],
          [-(GOING_CARD_PAD + GOING_AVATAR), 0],
          Extrapolation.CLAMP
        ),
      },
      {
        rotateZ: `${interpolate(
          entrance.value,
          [0, 1],
          [ROW_TILT, 0],
          Extrapolation.CLAMP
        )}deg`,
      },
    ],
  }));
  // Held back until the avatar is most of the way home, so the name reads as
  // catching up to the face rather than travelling alongside it.
  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(entrance.value, [0.55, 1], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View style={styles.goingRow} onLayout={handleLayout}>
      <Animated.View style={avatarStyle}>
        <Avatar name={person.name} photoUrl={person.photo_url} size={GOING_AVATAR} />
      </Animated.View>
      <Animated.View style={[styles.goingRowText, textStyle]}>
        <Text style={styles.goingRowName} numberOfLines={1}>
          {person.name}
        </Text>
        {isHost && <Tag label="Host" color={COLORS.primary} />}
      </Animated.View>
    </View>
  );
}

// The not-joined card: the horizontal face pile this card carried before it grew
// rows, on the same entrance driver. Non-members can see who's there but not the
// roster, so a stack plus the gate says everything there is to say and a list of
// three names out of eight would only imply otherwise.
function GoingStack({
  people,
  count,
  cardOffset,
  heroGrow,
  sheetProgress,
  screenH,
  onLayout,
}: {
  people: Attendee[];
  count: number;
  cardOffset: number;
  heroGrow: number;
  sheetProgress: SharedValue<number>;
  screenH: number;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const [box, setBox] = useState<{ y: number; h: number } | null>(null);
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { y, height: h } = e.nativeEvent.layout;
      setBox((prev) => (prev?.y === y && prev?.h === h ? prev : { y, h }));
      onLayout?.(e);
    },
    [onLayout]
  );

  const entrance = useRowEntrance({
    cardOffset,
    heroGrow,
    sheetProgress,
    screenH,
    y: box?.y ?? null,
    h: box?.h ?? null,
  });

  const stackStyle = useAnimatedStyle(() => ({
    opacity: interpolate(entrance.value, [0, 0.5], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateX: interpolate(
          entrance.value,
          [0, 1],
          [-(GOING_CARD_PAD + GOING_AVATAR), 0],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  return (
    <View style={styles.goingCardBody} onLayout={handleLayout}>
      <Animated.View style={stackStyle}>
        <AttendeeStack
          people={people}
          count={count}
          max={5}
          size={GOING_AVATAR}
          emptyLabel="Be the first to join"
        />
      </Animated.View>
      <Text style={[styles.goingCardHint, styles.goingStackHint]}>
        Join to see the full list of attendees
      </Text>
    </View>
  );
}

function EventBottomSheet({
  eventId,
  depth,
  isTop,
  onPush,
  onDismiss,
  onCloseAll,
}: Props) {
  const sheetRef = useRef<BottomSheet>(null);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Measured below (null until laid out). `firstSnapPx` is the resting stop —
  // the only stop that needs measuring, since the other one is the top of the
  // screen. `goingAnchorPx` is how far the hero's anchor sits below the content
  // card's top — see the anchor note below.
  const [firstSnapPx, setFirstSnapPx] = useState<number | null>(null);
  const [goingAnchorPx, setGoingAnchorPx] = useState<number | null>(null);
  const first = firstSnapPx ?? Math.round(height * 0.46);

  // The sheet's climb, resting stop → y=0. This is the whole budget for the leg,
  // and it is shared: whatever the photo doesn't take, the content rises by.
  const climb = height - first;
  // Where the hero's anchor should come to rest at the full stop — clear of the
  // home indicator, with a little breathing room, so nothing lands tucked under
  // the indicator bar.
  const goingRestBottom = height - insets.bottom - SPACING[3];
  // The hero's growth, and the single place the budget is split. At the full stop
  // the sheet's top is at y=0, so the photo runs 0 → BANNER_H + grow, the content
  // card's top lands right underneath it, and the anchor is another
  // `goingAnchorPx` down. Solving "the anchor sits at `goingRestBottom`" for the
  // grow is the subtraction below.
  //
  // ── Why the anchor is the who's-going card's FIRST ROW, not its bottom ──────
  // The obvious anchor is the card's bottom edge — "grow the photo until the
  // whole card still fits". But then the hero is a function of how many people
  // are going: a four-row card is ~160pt taller than a one-row card, and every
  // one of those points comes straight off the photo. The same event would open
  // with a visibly different hero the day a third person joined.
  //
  // Anchoring on the first row's bottom instead makes the hero depend only on
  // what sits ABOVE who's-going — host row, title, info, description, actions —
  // which is fixed for a given event. The card is then free to grow downward past
  // the fold; you scroll for the rest of it. Header and the first person stay
  // visible, which is what the card is for at a glance.
  //
  // Clamped at both ends, and both clamps matter:
  //   floor 0     a dense event (long description, three actions) can measure
  //               past the budget entirely. The photo then doesn't grow at all
  //               and the leg is a pure content rise. Nothing looks broken.
  //   ceiling climb  the slide can never exceed the sheet's own climb. Past that
  //               the content would drift DOWN against the drag, which is what
  //               read as the sheet "going back down" mid-gesture.
  const heroGrow = Math.max(
    0,
    Math.min(
      goingRestBottom -
        (goingAnchorPx ?? Math.round(height * 0.46)) -
        BANNER_H +
        HERO_OVERSHOOT,
      climb
    )
  );
  // The hero is rendered exactly tall enough to fill what the reveal uncovers, so
  // its bottom edge always meets the card's top — no seam at any snap.
  const photoRenderH = BANNER_H + heroGrow;

  // Scroll room past the last row: the home-indicator inset, a comfortable gap,
  // and the hero's grow — the card is translated down by `heroGrow` at the full
  // stop, so without this the last row would be pushed off the bottom.
  const contentPadBottom = insets.bottom + SPACING[8] + heroGrow;

  // Two stops, so gorhom's live snap progress (`animatedIndex`) runs 0 (resting,
  // below Open chat/Join) → 1 (full screen). The photo doesn't grow by animating
  // its height (that per-frame layout pass over the whole content tree was the
  // stutter). Instead it's a fixed-height hero pinned behind the content, and the
  // white card slides DOWN to uncover it — a single transform on the UI thread.
  //
  // The slide is `heroGrow` against a climb of `climb`, both linear in the drag,
  // so the photo grows and the content rises at the same time and at a constant
  // rate. The content's rise is exactly `climb - heroGrow` — that rise is what
  // carries the who's-going card up into view, and it's why the photo has to be
  // capped rather than given the whole climb.
  const animatedIndex = useSharedValue(0);
  const cardRevealStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          animatedIndex.value,
          [0, 1],
          [0, heroGrow],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  // The on-photo chrome (grab handle, category pill, save/share) hugs the sheet's
  // top edge at rest; at the full stop the sheet reaches y=0, so it slides down
  // by the top inset to sit clear of the status bar / dynamic island instead of
  // underneath it. Same 0→1 leg as the photo grow.
  const chromeInsetStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          animatedIndex.value,
          [0, 1],
          [0, insets.top],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  // The attendee hand-off, played across the one leg (stop 0 → 1, Open chat →
  // full screen). As the sheet grows the little "going" stack up in the host row
  // leans into its own momentum and slides off to the right; the who's-going
  // card's faces answer by sweeping in from the left and settling — so the same
  // people appear to relocate from the header down into the card as it scrolls
  // into view. Both off animatedIndex (UI thread, no JS/frame).
  const hostStackExitStyle = useAnimatedStyle(() => {
    const p = animatedIndex.value;
    return {
      opacity: interpolate(p, [0, 0.6], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(p, [0, 0.9], [0, width], Extrapolation.CLAMP) },
        { rotateZ: `${interpolate(p, [0, 0.9], [0, 9], Extrapolation.CLAMP)}deg` },
      ],
    };
  });
  // …and the answering half is `GoingRow`, one per person — see ROW_WINDOWS.

  // Every number here is measured, not guessed, so they land on any screen and
  // any event length. `actionsY` is the action stack's offset within the content
  // card; `primaryBottom` is the Open chat/Join button's bottom edge within that
  // stack; `goingCardY` is the who's-going card's top and `goingRowBottom` the
  // first person row's bottom edge within it. The content card sits below the
  // photo (marginTop BANNER_H) with its own top padding, so the resting sheet
  // height = BANNER_H + actionsY + primaryBottom. The card's translateY is a
  // transform, so it never shifts these layout coordinates — the measurements are
  // stable at every snap, which is the only reason measuring once works.
  const actionsYRef = useRef<number | null>(null);
  const primaryBottomRef = useRef<number | null>(null);
  const goingCardYRef = useRef<number | null>(null);
  const goingAnchorBottomRef = useRef<number | null>(null);
  // Where the who's-going card's top sits inside the content card. State, not a
  // ref, because the entrance worklets read it — see `useRowEntrance`.
  const [goingCardOffset, setGoingCardOffset] = useState(0);
  const recomputeSnaps = useCallback(() => {
    const a = actionsYRef.current;
    if (a == null) return;
    const p = primaryBottomRef.current;
    if (p != null) {
      // Resting stop: just below Open chat/Join, one action-gap of breathing
      // room. BANNER_H is the card's marginTop (the photo above it); the measured
      // `actionsY` already includes the card's own paddingTop, so it isn't added
      // again. Clamped below the full stop so the two stops can never cross (a
      // tall event would otherwise measure past full screen).
      const next = Math.round(
        Math.min(BANNER_H + a + p + SPACING[2.5], height * 0.82)
      );
      setFirstSnapPx((prev) => (prev === next ? prev : next));
    }
    const cardY = goingCardYRef.current;
    if (cardY != null) {
      const next = Math.round(a + cardY);
      setGoingCardOffset((prev) => (prev === next ? prev : next));
    }
    const anchorBottom = goingAnchorBottomRef.current;
    if (cardY != null && anchorBottom != null) {
      // Everything in the content card above the hero's anchor. Measured from the
      // content card's top, NOT the sheet's — the hero cap subtracts BANNER_H
      // separately, and folding it in here would double-count it.
      //
      // The card's own bottom padding is added back on so the anchor sits where
      // the card's edge *would* be if it held only this one row. That is what
      // makes the hero come out the same size it did before the card grew rows —
      // and the same size for a member and a non-member, whose card holds a face
      // pile of the same height instead.
      const next = Math.round(a + cardY + anchorBottom + GOING_CARD_PAD);
      setGoingAnchorPx((prev) => (prev === next ? prev : next));
    }
  }, [height]);
  const onActionsLayout = useCallback(
    (e: LayoutChangeEvent) => {
      actionsYRef.current = e.nativeEvent.layout.y;
      recomputeSnaps();
    },
    [recomputeSnaps]
  );
  const onPrimaryLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { y, height: h } = e.nativeEvent.layout;
      primaryBottomRef.current = y + h;
      recomputeSnaps();
    },
    [recomputeSnaps]
  );
  // The first person row for a member, the face pile for a non-member — whichever
  // this card leads with is what the hero grows down to.
  const onGoingAnchorLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { y, height: h } = e.nativeEvent.layout;
      goingAnchorBottomRef.current = y + h;
      recomputeSnaps();
    },
    [recomputeSnaps]
  );
  const onGoingCardLayout = useCallback(
    (e: LayoutChangeEvent) => {
      goingCardYRef.current = e.nativeEvent.layout.y;
      recomputeSnaps();
    },
    [recomputeSnaps]
  );
  // Two stops. Resting: below Open chat/Join (a tap opens here). Full screen: one
  // scroll up and the sheet's top edge is at y=0 with the photo filling every
  // pixel it uncovered. `'100%'` rather than a computed number on purpose — it is
  // the screen's own height on whatever device this is, so there is no rounding
  // or reserved headroom that could leave a sliver of backdrop showing.
  const snapPoints = useMemo<(string | number)[]>(
    () => [firstSnapPx ?? '46%', '100%'],
    [firstSnapPx]
  );

  // A single smooth curve for every snap — including the release snap-back from
  // a half-drag, which otherwise jumped to the stop without animating.
  const animationConfigs = useBottomSheetTimingConfigs({
    duration: 300,
    easing: Easing.out(Easing.cubic),
  });

  const { data: event, isLoading } = useQuery({
    queryKey: queryKeys.eventDetail.of(eventId),
    queryFn: () => getEventDetail(eventId!),
    enabled: !!eventId,
  });

  const when = event ? splitEventTime(event.starts_at) : null;

  // "Happening near you" rail. Reuses the map/home nearby query (keyed on the
  // user's location + radius), drops the event you're already looking at, and
  // floats same-activity events to the front so the rail reads as "more like
  // this". Empty until location is on — the section hides itself then.
  const { data: nearbyRaw } = useNearbyEvents();
  const nearbyEvents = (nearbyRaw ?? [])
    .filter((e) => e.id !== eventId)
    .sort(
      (a, b) =>
        Number(b.activity === event?.activity) -
        Number(a.activity === event?.activity)
    )
    .slice(0, 8);

  // The sheet is controlled now (one instance per stacked event id) and opens
  // itself: it mounts with `index={0}`, so gorhom animates it open on mount —
  // no imperative `.open()` and no rAF snap that could fire before the fresh
  // sheet is even laid out (which was leaving it closed).

  // Back: nested sheets pop back to the parent (closing this gorhom sheet
  // fires onDismiss, which the stack turns into a pop); the root sheet just
  // collapses to the first stop.
  const handleBack = useCallback(() => {
    if (depth > 1) sheetRef.current?.close();
    else sheetRef.current?.snapToIndex(0);
  }, [depth]);

  // Wishlist toggle for this event — the same save a right-swipe performs, so
  // both paths share the ['savedEventIds'] cache every badge reads.
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1900);
    return () => clearTimeout(t);
  }, [toast]);

  const { data: savedIds } = useSavedEventIds();
  const isSaved = !!eventId && !!savedIds?.includes(eventId);
  const saveMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (!user || !eventId) return;
      if (next) await saveEvent(user.id, eventId);
      else await unsaveEvent(user.id, eventId);
    },
    // Optimistic: the bookmark fills the instant it's tapped, then reconciles.
    onMutate: async (next: boolean) => {
      const key = queryKeys.savedEventIds.of(user?.id);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<string[]>(key);
      qc.setQueryData<string[]>(key, (ids = []) =>
        next ? [...ids, eventId!] : ids.filter((id) => id !== eventId)
      );
      return { prev, key };
    },
    onSuccess: (_d, next) => {
      setToast(next ? 'Added to wishlist' : 'Removed from wishlist');
    },
    // Previously this rolled back silently, which read as "the button does
    // nothing" — a failed save now says so instead of just snapping back.
    onError: (_e, _next, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.prev);
      setToast("Couldn't update wishlist");
    },
    onSettled: () => {
      qc.invalidateQueries({
        queryKey: queryKeys.savedEventIds.of(user?.id),
      });
      qc.invalidateQueries({ queryKey: queryKeys.savedEvents.of(user?.id) });
    },
  });

  // Distance user↔event for the Mello+ >10 km join gate. The detail query
  // can't provide it (no lat/lng in SELECT *); fails soft to "no gate" when
  // location is off or migration 024 isn't applied yet.
  const coords = useLocationStore((s) => s.coords);
  const { data: gateDistanceM } = useQuery({
    queryKey: ['eventDistance', eventId],
    queryFn: () => getEventDistanceM(eventId!, coords!),
    enabled: !!eventId && !!coords,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const premiumUser = isPremium(user);
  const tooFar =
    !premiumUser &&
    gateDistanceM != null &&
    gateDistanceM > CONFIG.freeJoinRadiusMeters;

  const isHost = event?.host_id === user?.id;
  const myStatus = event?.participants?.find((p) => p.id === user?.id)?.status;
  const isParticipant = myStatus === 'approved';
  const isPending = myStatus === 'pending';
  const isFull =
    event?.max_people != null &&
    (event.participant_count ?? 0) >= event.max_people;
  // RLS already hides women-only events from non-female viewers; this is a
  // client-side belt-and-braces for anything fetched by direct id.
  const womenOnlyLocked =
    !!event?.women_only && !isHost && user?.gender !== 'female';

  const approved =
    event?.participants?.filter((p) => p.status === 'approved') ?? [];

  // The card's person rows. Order comes from the server — `event_attendees_preview`
  // ranks by `ep.joined_at, pr.id`, and migration 043 gives the host a
  // participant row at creation time, so the host already sorts first and the
  // rest follow by join time. The pin below is belt-and-braces: the RLS-visible
  // rows are merged into that list by id, and if a merge ever reordered them the
  // host tag would silently land on the wrong person. There is no join timestamp
  // on the client objects to re-sort by, so this is the one thing worth pinning.
  const goingRows = [...approved]
    .sort(
      (a, b) =>
        Number(b.id === event?.host_id) - Number(a.id === event?.host_id)
    )
    .slice(0, GOING_ROWS);
  // More people than rows shown — otherwise "See all 3" points at a list you are
  // already looking at in full.
  const hasMoreGoing = (event?.participant_count ?? 0) > goingRows.length;
  // Invite fills the gap a thin roster leaves rather than being a permanent row,
  // so a full card is exactly three people plus See all. Members only: sharing a
  // link to an event you haven't joined is vouching for something you're not
  // part of.
  const canInvite = (isParticipant || isHost) && goingRows.length < GOING_ROWS;
  // Mello+ members' requests surface first for the host.
  const pending = (
    event?.participants?.filter((p) => p.status === 'pending') ?? []
  ).sort((a, b) => Number(isPremium(b)) - Number(isPremium(a)));

  const { join, leave, approve, reject } = useEventParticipation(
    eventId,
    user ?? null,
    event
  );

  // ─── Pre-join safety queue (#3 first join, #10 women-only, #5 new host,
  //     #8 party/alcohol) ────────────────────────────────────────────────────
  const [joinQueue, setJoinQueue] = useState<QueuedSafetyPopup[]>([]);

  // ─── Leave flow: confirm → reason (spec: "are you sure?" then a reason) ─────
  // Leaving is two-step and the reason is recorded (event_leave_feedback). The
  // reason picker only opens after the confirm, so an accidental tap can't
  // remove you.
  const [leaveStep, setLeaveStep] = useState<'idle' | 'confirm' | 'reason'>(
    'idle'
  );
  const [leaveReason, setLeaveReason] = useState<string | null>(null);
  const [leaveDetail, setLeaveDetail] = useState('');

  function resetLeaveFlow() {
    setLeaveStep('idle');
    setLeaveReason(null);
    setLeaveDetail('');
  }

  function confirmLeave() {
    if (!leaveReason) return;
    leave.mutate({
      reason: leaveReason,
      detail: leaveDetail.trim() || undefined,
    });
    resetLeaveFlow();
    sheetRef.current?.close();
  }

  async function handleJoinPress() {
    if (!event || !user) return;

    // Beyond the free 10 km radius: browsing is fine, joining needs Mello+.
    if (tooFar) {
      router.push('/premium?reason=distance');
      return;
    }

    const queue: QueuedSafetyPopup[] = [];

    if (!(await hasSeenSafetyFlag(user.id, 'first_join'))) {
      queue.push({
        flag: 'first_join',
        icon: 'parties',
        title: 'Nice — your first Mello 🎉',
        body: [
          'Meet in public the first time.',
          "Tell a friend where you're going.",
          "Check the host's profile and reviews.",
          'If anything feels off, leave and report — no explanation needed.',
        ],
        primaryLabel: 'Count me in',
      });
    }

    if (
      event.women_only &&
      !(await hasSeenSafetyFlag(user.id, `women_event.${event.id}`))
    ) {
      queue.push({
        flag: `women_event.${event.id}`,
        icon: 'heart',
        accent: '#7C5CE0',
        tint: '#F0ECFC',
        title: 'A space for women',
        body:
          'This event is for women only. If anyone makes you ' +
          'uncomfortable you can leave, block and report — ' +
          "women's-safety reports are reviewed as a priority.",
        primaryLabel: 'Join',
      });
    }

    if (
      isNewHost(event.host?.created_at) &&
      !(await hasSeenSafetyFlag(user.id, `new_host.${event.host_id}`))
    ) {
      queue.push({
        flag: `new_host.${event.host_id}`,
        icon: 'shieldAlert',
        accent: '#C8791E',
        tint: '#FBF0E2',
        title: 'A quick heads-up',
        body:
          "This host is fairly new to Mello. That's not necessarily a " +
          'problem — just take a little extra care: meet in public, bring ' +
          'a friend, and keep personal details to yourself.',
        primaryLabel: 'Got it, join anyway',
        secondaryLabel: 'View host profile',
        onSecondary: () => {
          setJoinQueue([]);
          onCloseAll();
          router.push(`/friends/${event.host_id}`);
        },
      });
    }

    if (
      isPartyActivity(event.activity) &&
      !(await hasSeenSafetyFlag(user.id, `party.${event.id}`))
    ) {
      queue.push({
        flag: `party.${event.id}`,
        icon: 'drinks',
        accent: '#D6478E',
        tint: '#FBE7F1',
        title: 'Have a great night — stay in control',
        body: [
          'Know your limit and plan your way home.',
          "Watch your drink — don't accept opened drinks.",
          'Consent always matters. "No" is a full answer.',
          'Look out for each other.',
        ],
        primaryLabel: 'Got it',
      });
    }

    if (queue.length > 0) setJoinQueue(queue);
    else join.mutate();
  }

  // Confirming the current popup marks it seen; the join fires once the
  // queue is empty.
  function confirmQueuedPopup() {
    const current = joinQueue[0];
    if (current && user) markSafetyFlagSeen(user.id, current.flag);
    const rest = joinQueue.slice(1);
    setJoinQueue(rest);
    if (rest.length === 0) join.mutate();
  }

  const activity = event ? ACTIVITY_MAP[event.activity] : null;
  // Same fallback the cards use, so a photoless event doesn't show the host's
  // face in the rail and a grey placeholder in its own hero. `host_photo_url` is
  // flattened onto the feed RPCs but `getEventDetail` selects the host nested,
  // so it's handed over explicitly rather than read off the event.
  const heroUri = event
    ? eventImageUri({
        image_url: event.image_url,
        host_photo_url: event.host?.photo_url,
      })
    : null;

  // Wishlist toast, pinned to the bottom of the VISIBLE sheet via the
  // library's footer (a hand-positioned absolute child sits in the sheet's
  // full-height inner container, which extends off-screen at partial snaps).
  // Must be identity-stable across unrelated re-renders: a fresh function
  // makes the footer remount, and reanimated then overlaps the exiting
  // snapshot with the entering one — a doubled toast.
  // Dims the screen behind the sheet — including the floating tab bar, which
  // the sheet now sits above (mounted in (tabs)/_layout). Tapping the dim
  // closes. Identity-stable so the sheet doesn't remount it each render.
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        // Darker than the library's 0.5 default — the frosted-white card wants
        // more contrast under it to read as glass floating over the app.
        opacity={0.62}
      />
    ),
    []
  );

  const renderToast = useCallback(
    (props: BottomSheetFooterProps) =>
      toast ? (
        <BottomSheetFooter {...props} bottomInset={24}>
          <Animated.View
            entering={FadeInUp.duration(200)}
            exiting={FadeOut.duration(160)}
            style={styles.toast}
            pointerEvents="none"
          >
            <Icon
              name="bookmarkFilled"
              size={15}
              color="#fff"
              strokeWidth={2}
            />
            <Text style={styles.toastText}>{toast}</Text>
          </Animated.View>
        </BottomSheetFooter>
      ) : null,
    [toast]
  );

  return (
    <BottomSheet
      ref={sheetRef}
      // Opens on mount (gorhom animates to this index). The stack only renders a
      // sheet when it has an entry, so mounting = opening.
      index={0}
      // The measured resting stop, then the top of the screen. gorhom writes the
      // live snap progress into `animatedIndex`, which drives the card's reveal —
      // so the image opens on the same drag that raises the sheet.
      snapPoints={snapPoints}
      animatedIndex={animatedIndex}
      animationConfigs={animationConfigs}
      // Off: it defaults on in gorhom v5 and re-measures content against the
      // fixed snap point on every expand.
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={() => {
        resetLeaveFlow();
        // Tell the stack this entry is gone (pop / clear).
        onDismiss();
      }}
      // Only the top sheet dims the screen; a peeked sheet underneath would
      // otherwise double the scrim.
      backdropComponent={isTop ? renderBackdrop : undefined}
      backgroundStyle={styles.sheetBg}
      handleComponent={null}
      footerComponent={renderToast}
    >
      {/* Photo — the full-size hero pinned BEHIND the content at bigPhotoH. Only
          the top BANNER_H shows at the first stop (the white card covers the
          rest); as the sheet expands the card slides down and uncovers it.
          pointerEvents none so drags on the photo fall through to the sheet. */}
      {event && (
        <View
          pointerEvents="none"
          style={[styles.heroPhoto, { height: photoRenderH }]}
        >
          {heroUri ? (
            <Image
              source={{ uri: heroUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
              recyclingKey={event.id}
            />
          ) : (
            <Text style={styles.bannerHint}>EVENT PHOTO</Text>
          )}
        </View>
      )}

      <BottomSheetScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: contentPadBottom },
        ]}
      >
        {isLoading || !event ? (
          <ActivityIndicator
            color={COLORS.primary}
            style={{ marginTop: SPACING[10] }}
          />
        ) : (
          // The content card: white, sitting just below the photo (marginTop
          // BANNER_H) and scrolling up over it. Its white fill covers the photo;
          // the reveal transform slides it down at the full stop to uncover the
          // rest of the hero.
          <Animated.View style={[styles.contentCard, cardRevealStyle]}>
            {/* Host row */}
            {event.host && (
              <View style={styles.hostRow}>
                <Avatar
                  name={event.host.name}
                  photoUrl={event.host.photo_url}
                  size={34}
                  ringColor={COLORS.white}
                  ringWidth={1.5}
                />
                <View style={styles.hostNameRow}>
                  <Text style={styles.hostName} numberOfLines={1}>
                    {event.host.name}
                  </Text>
                  {event.host_verified && <VerifiedBadge size={14} />}
                  {isPremium(event.host) && <PremiumBadge size={13} />}
                  <Text style={styles.hostLabel}>is hosting</Text>
                </View>
                {event.participant_count > 0 && (
                  <Animated.View style={[styles.goingWrap, hostStackExitStyle]}>
                    <AttendeeStack
                      people={approved}
                      count={event.participant_count}
                      max={3}
                      size={26}
                    />
                    <Text style={styles.goingText}>going</Text>
                  </Animated.View>
                )}
              </View>
            )}

            <Text style={styles.title}>{event.title}</Text>

            {/* Date + location info cards */}
            <View style={styles.infoRow}>
              <View style={styles.infoCard}>
                <Icon
                  name="calendar"
                  size={20}
                  color={COLORS.primary}
                  strokeWidth={2}
                />
                <View style={styles.infoText}>
                  <Text style={styles.infoTitle} numberOfLines={1}>
                    {when?.dateShort}
                  </Text>
                  <Text style={styles.infoSub}>{when?.timeShort}</Text>
                </View>
              </View>
              <View style={styles.infoCard}>
                <Icon
                  name="location"
                  size={20}
                  color={COLORS.primary}
                  strokeWidth={2}
                />
                <View style={styles.infoText}>
                  <Text style={styles.infoTitle} numberOfLines={1}>
                    {event.location_name
                      ? neighbourhood(event.location_name)
                      : 'Location'}
                  </Text>
                  <Text style={styles.infoSub}>
                    {event.distance_m != null
                      ? `${formatDistance(event.distance_m)} away`
                      : 'Nearby'}
                  </Text>
                </View>
              </View>
            </View>

            {tooFar && !isParticipant && !isPending && (
              <View style={styles.premiumPill}>
                <Icon
                  name="crown"
                  size={13}
                  color={PREMIUM_GOLD}
                  strokeWidth={2}
                />
                <Text style={styles.premiumPillText}>
                  Beyond your 10 km — join with Mello+
                </Text>
              </View>
            )}

            {event.women_only && (
              <View style={styles.womenOnlyPill}>
                <Icon
                  name="user"
                  size={13}
                  color={COLORS.secondary}
                  strokeWidth={2}
                />
                <Text style={styles.womenOnlyText}>Female-only event</Text>
              </View>
            )}

            {event.description && (
              <Text style={styles.description}>{event.description}</Text>
            )}

            {/* Host: pending join requests to approve/reject */}
            {isHost && pending.length > 0 && (
              <View style={styles.pendingSection}>
                <SectionLabel style={styles.sectionLabel}>
                  Requests · {pending.length}
                </SectionLabel>
                {pending.map((p) => (
                  <View key={p.id} style={styles.pendingRow}>
                    <Avatar name={p.name} photoUrl={p.photo_url} size={38} />
                    <View style={styles.pendingNameWrap}>
                      <Text style={styles.pendingName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      {isPremium(p) && <PremiumBadge size={13} />}
                    </View>
                    <PressableScale
                      scaleTo={0.92}
                      style={styles.approveBtn}
                      onPress={() => approve.mutate(p.id)}
                      disabled={approve.isPending}
                    >
                      <Text style={styles.approveBtnText}>Approve</Text>
                    </PressableScale>
                    <PressableScale
                      scaleTo={0.92}
                      style={styles.rejectBtn}
                      onPress={() => reject.mutate(p.id)}
                      disabled={reject.isPending}
                      accessibilityLabel="Decline request"
                    >
                      <Icon
                        name="close"
                        size={16}
                        color="rgba(0,0,0,0.55)"
                        strokeWidth={2}
                      />
                    </PressableScale>
                  </View>
                ))}
              </View>
            )}

            {/* Actions.
                  Order for someone who's in: Open chat → Check in → who's-going
                  card → Leave (last, behind a confirm). The host is a participant
                  since migration 043, so `isParticipant` is true for them too —
                  guard the guest-only actions (Check in, Leave) with `!isHost`. */}
            <View style={styles.actions} onLayout={onActionsLayout}>
              {/* Ended event: attendees get the wrap. Nobody gets join/leave/
                    check-in on a finished event — those only exist below, guarded
                    by !hasWrapped. */}
              {hasWrapped(event) && (isParticipant || isHost) && (
                <Button
                  label="Open the event wrap"
                  onPress={() => {
                    onCloseAll();
                    router.push(`/events/wrap/${event.id}`);
                  }}
                />
              )}

              {/* Live event: the headline action, then check-in for guests.
                    The host is a participant since migration 043, so
                    `isParticipant` is true for them too — guest-only actions are
                    guarded with `!isHost`. */}
              {!hasWrapped(event) && (
                <View onLayout={onPrimaryLayout}>
                  {isHost ? (
                    <Button
                      label="Manage event"
                      onPress={() => {
                        onCloseAll();
                        router.push(`/events/host/${event.id}`);
                      }}
                    />
                  ) : isParticipant ? (
                    <Button
                      label="Open chat"
                      onPress={() => {
                        onCloseAll();
                        router.push(`/(tabs)/chats/${event.id}`);
                      }}
                    />
                  ) : (
                    <View style={styles.footerRow}>
                      {event.max_people != null && (
                        <View style={styles.spotsInfo}>
                          <Text style={styles.spotsCount}>
                            {event.participant_count}/{event.max_people}
                          </Text>
                          <Text style={styles.spotsLeft}>
                            {Math.max(
                              event.max_people - event.participant_count,
                              0
                            )}{' '}
                            spots left
                          </Text>
                        </View>
                      )}
                      <Button
                        style={{ flex: 1 }}
                        label={
                          isPending
                            ? 'Request pending'
                            : womenOnlyLocked
                              ? 'Female-only event'
                              : isFull
                                ? 'Event full'
                                : tooFar
                                  ? 'Join with Mello+'
                                  : event.requires_approval
                                    ? 'Request to join'
                                    : 'Join event'
                        }
                        // Joining is the headline action, so it gets coral.
                        // A pending/closed state drops to low emphasis.
                        variant={
                          isPending || isFull || womenOnlyLocked
                            ? 'tertiary'
                            : 'primary'
                        }
                        // Pending cancels the request (no reason — a request
                        // withdrawn before approval isn't "leaving").
                        onPress={() =>
                          isPending ? leave.mutate() : handleJoinPress()
                        }
                        disabled={
                          ((isFull || womenOnlyLocked) && !isPending) ||
                          join.isPending ||
                          leave.isPending
                        }
                      />
                    </View>
                  )}
                </View>
              )}

              {!hasWrapped(event) && (
                <>
                  {/* Host also gets the chat, under Manage. */}
                  {isHost && (
                    <Button
                      label="Open chat"
                      variant="tertiary"
                      onPress={() => {
                        onCloseAll();
                        router.push(`/(tabs)/chats/${event.id}`);
                      }}
                    />
                  )}

                  {/* Approved guest scans to check in (hosts run the door). */}
                  {isParticipant && !isHost && (
                    <Button
                      label="Check in"
                      variant="tertiary"
                      onPress={() => {
                        onCloseAll();
                        router.push(`/events/scan/${event.id}`);
                      }}
                    />
                  )}
                </>
              )}

              {/* Who's going — a white card lifted off the white sheet by a soft
                    shadow (a translucent-white Glass panel would vanish into it).
                    Two nested views on purpose: the outer one carries the shadow,
                    the inner one clips. Android's elevation shadow is clipped
                    away by `overflow: 'hidden'`, so the two cannot live on the
                    same element — the same split `Glass` uses, for the same
                    reason. The clip is what makes the rows appear from the card's
                    own border. */}
              <View style={styles.goingCard} onLayout={onGoingCardLayout}>
                <View style={styles.goingCardClip}>
                  <View style={styles.goingCardHead}>
                    <SectionLabel>{"Who's going"}</SectionLabel>
                    {event.participant_count > 0 && (
                      <Text style={styles.goingCardCount}>
                        {event.participant_count}
                        {event.max_people ? `/${event.max_people}` : ''}
                      </Text>
                    )}
                  </View>

                  {isParticipant || isHost ? (
                    <>
                      {goingRows.length > 0 ? (
                        goingRows.map((person, i) => (
                          <GoingRow
                            key={person.id}
                            person={person}
                            isHost={person.id === event.host_id}
                            cardOffset={goingCardOffset}
                            heroGrow={heroGrow}
                            sheetProgress={animatedIndex}
                            screenH={height}
                            // Row 0's bottom edge is the hero's anchor — the
                            // photo grows until this row still lands clear of
                            // the home indicator. Measuring the row rather than
                            // the card is what keeps the hero the same size
                            // whether one person is going or eight.
                            onLayout={i === 0 ? onGoingAnchorLayout : undefined}
                          />
                        ))
                      ) : (
                        <Text style={styles.goingCardHint}>
                          Be the first to join
                        </Text>
                      )}

                      {/* Invite only fills the gap a thin roster leaves, so a
                          full card is exactly three people plus See all. */}
                      {canInvite && (
                        <PressableScale
                          style={styles.goingActionRow}
                          scaleTo={0.98}
                          onPress={() => shareEvent(event)}
                        >
                          <View style={styles.goingActionIcon}>
                            <Icon
                              name="userPlus"
                              size={17}
                              color={COLORS.primary}
                              strokeWidth={2}
                            />
                          </View>
                          <Text style={styles.goingActionLabel}>
                            Invite friends
                          </Text>
                        </PressableScale>
                      )}

                      {hasMoreGoing && (
                        <PressableScale
                          style={styles.goingActionRow}
                          scaleTo={0.98}
                          onPress={() => {
                            onCloseAll();
                            router.push(`/events/attendees/${event.id}`);
                          }}
                        >
                          <Text style={styles.goingCardLink}>
                            See all {event.participant_count}
                          </Text>
                          <Icon
                            name="chevronRight"
                            size={15}
                            color={COLORS.primary}
                            strokeWidth={2}
                          />
                        </PressableScale>
                      )}
                    </>
                  ) : (
                    // Not joined: the face pile and the gate. The roster stays
                    // behind joining, as it always has — the preview faces are
                    // public, the list is not. This is also the hero's anchor
                    // here, since there is no row 0 to measure; it comes out
                    // within a point or two of the row-0 anchor, so the photo is
                    // the same size either way.
                    <GoingStack
                      people={approved}
                      count={event.participant_count}
                      cardOffset={goingCardOffset}
                      heroGrow={heroGrow}
                      sheetProgress={animatedIndex}
                      screenH={height}
                      onLayout={onGoingAnchorLayout}
                    />
                  )}
                </View>
              </View>

              {/* Happening near you — more events like this one, revealed as
                    the sheet goes full-screen. Same-activity events sort first.
                    Tapping one opens it in a NEW sheet stacked above this one. */}
              {nearbyEvents.length > 0 && (
                <View style={styles.nearbySection}>
                  <SectionLabel>Happening near you</SectionLabel>
                  {/* gorhom's own scroll view for the nested horizontal rail —
                        a plain RN ScrollView inside the sheet mis-handles the
                        gesture and can leave the recycled images blank.
                        removeClippedSubviews off so off-screen cards keep their
                        photos mounted. */}
                  <BottomSheetScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    removeClippedSubviews={false}
                    contentContainerStyle={styles.nearbyRail}
                  >
                    {nearbyEvents.map((e) => (
                      <NearbyMini
                        key={e.id}
                        event={e}
                        onPress={() => onPush(e.id)}
                      />
                    ))}
                  </BottomSheetScrollView>
                </View>
              )}

              {/* Leave — live event, guest only, and always last. Confirm
                    first, then a reason (recorded in event_leave_feedback). */}
              {isParticipant && !isHost && !hasWrapped(event) && (
                <Button
                  label="Leave event"
                  variant="tertiary"
                  onPress={() => setLeaveStep('confirm')}
                  disabled={leave.isPending}
                />
              )}
            </View>
          </Animated.View>
        )}
      </BottomSheetScrollView>

      {/* On-photo chrome, ABOVE the scroll view so the buttons stay tappable
          (the photo itself is behind it). box-none lets drags on empty photo pass
          through to the sheet. */}
      {event && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.chrome, chromeInsetStyle]}
        >
          <View style={styles.grab} />
          {/* Top-left: back button when this sheet is stacked over another
              (opened from "Happening near you"), otherwise the category pill. */}
          <View style={styles.chromeTopLeft} pointerEvents="box-none">
            {depth > 1 ? (
              <NavButton
                icon="back"
                color={COLORS.white}
                onPress={handleBack}
                accessibilityLabel="Back"
              />
            ) : (
              <CategoryPill
                emoji={activity?.emoji ?? '📍'}
                label={activity?.label}
                color={categoryStyle(event.activity).accent}
              />
            )}
          </View>
          {/* Top-right: save + share. */}
          <View style={styles.chromeTopRight}>
            <PressableScale
              scaleTo={0.9}
              onPress={() => saveMutation.mutate(!isSaved)}
              accessibilityLabel={
                isSaved ? 'Remove from wishlist' : 'Add to wishlist'
              }
              accessibilityRole="button"
              accessibilityState={{ selected: isSaved }}
            >
              <Glass tier="onPhoto" radius={RADIUS.md} style={styles.chip}>
                <Icon
                  name={isSaved ? 'bookmarkFilled' : 'bookmark'}
                  size={18}
                  color={COLORS.white}
                  strokeWidth={2}
                />
              </Glass>
            </PressableScale>
            <PressableScale
              scaleTo={0.9}
              onPress={() => event && shareEvent(event)}
              accessibilityLabel="Share this event"
              accessibilityRole="button"
            >
              <Glass tier="onPhoto" radius={RADIUS.md} style={styles.chip}>
                <Icon
                  name="share"
                  size={18}
                  color={COLORS.white}
                  strokeWidth={2}
                />
              </Glass>
            </PressableScale>
          </View>
        </Animated.View>
      )}

      {/* Pre-join safety popups, one at a time. Dismissing cancels the join. */}
      {joinQueue.length > 0 && (
        <SafetyPopup
          visible
          icon={joinQueue[0].icon}
          accent={joinQueue[0].accent}
          tint={joinQueue[0].tint}
          title={joinQueue[0].title}
          body={joinQueue[0].body}
          primaryLabel={joinQueue[0].primaryLabel}
          onPrimary={confirmQueuedPopup}
          secondaryLabel={joinQueue[0].secondaryLabel}
          onSecondary={joinQueue[0].onSecondary}
          onClose={() => setJoinQueue([])}
        />
      )}

      {/* Leave flow, step 1: confirm. Backdrop-tap can't dismiss a destructive
            action — you leave by choosing, or explicitly stay. */}
      <Dialog
        visible={leaveStep === 'confirm'}
        onClose={resetLeaveFlow}
        dismissOnBackdropPress={false}
      >
        <Text style={styles.leaveTitle}>Leave this event?</Text>
        <Text style={styles.leaveBody}>
          {"You'll lose your spot and drop out of the event chat."}
        </Text>
        <View style={styles.leaveDialogButtons}>
          <Button
            label="Stay"
            variant="tertiary"
            size="md"
            style={{ flex: 1 }}
            onPress={resetLeaveFlow}
          />
          <Button
            label="Yes, leave"
            variant="secondary"
            size="md"
            style={{ flex: 1 }}
            onPress={() => setLeaveStep('reason')}
          />
        </View>
      </Dialog>

      {/* Leave flow, step 2: the reason, recorded in event_leave_feedback. */}
      <Sheet
        visible={leaveStep === 'reason'}
        onClose={resetLeaveFlow}
        grabber
        keyboardAvoiding
        animation="slide"
      >
        <View style={styles.reasonSheet}>
          <Text style={styles.leaveTitle}>Why are you leaving?</Text>
          <View style={styles.reasonChips}>
            {LEAVE_REASONS.map((r) => {
              const selected = leaveReason === r;
              return (
                <PressableScale
                  key={r}
                  scaleTo={0.97}
                  onPress={() => setLeaveReason(r)}
                  style={[styles.reasonChip, selected && styles.reasonChipOn]}
                >
                  <Text
                    style={[
                      styles.reasonChipText,
                      selected && styles.reasonChipTextOn,
                    ]}
                  >
                    {r}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          <TextField
            value={leaveDetail}
            onChangeText={setLeaveDetail}
            placeholder="Anything the host should know? (optional)"
            multiline
          />
          <Button
            label="Leave event"
            onPress={confirmLeave}
            disabled={!leaveReason || leave.isPending}
          />
        </View>
      </Sheet>
    </BottomSheet>
  );
}

export default EventBottomSheet;

const styles = StyleSheet.create({
  // A plain white card. Rounded top corners at the first stop; at the full stop
  // the banner grows square-topped and covers them, so the sheet reads as a
  // full-bleed page rather than a card. The lift shadow shows on iOS (it renders
  // outside the corners); Android's elevation is compensated by the dark
  // backdrop.
  sheetBg: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
  },
  // Just holds the content card; the card carries the real padding. paddingBottom
  // is passed inline (it compensates the card's translateY at full-screen).
  content: {},
  // The photo layer: absolute, pinned to the top of the sheet, behind the scroll
  // content. Height is set inline to the full bigPhotoH (the card slides down to
  // uncover it); overflow hidden clips the image to the sheet's rounded top.
  heroPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#E3E1E4',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The white content card, welded to the photo's bottom (marginTop BANNER_H +
  // cardStyle translateY). Its white fill is what covers the photo as it scrolls
  // up over it.
  contentCard: {
    marginTop: BANNER_H,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING[5],
    paddingTop: CARD_PAD_TOP,
    paddingBottom: SPACING[8],
    gap: SPACING[3],
  },
  bannerHint: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.nano,
    letterSpacing: 0.5,
    color: COLORS.textMuted,
  },
  // The chrome layer: absolute over everything, box-none. Children are absolutely
  // positioned within it; alignItems centres the grab handle (its left/right are
  // auto, so Yoga centres it).
  chrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: BANNER_H,
    alignItems: 'center',
  },
  grab: {
    position: 'absolute',
    top: 12,
    width: 40,
    height: 5,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },

  chromeTopLeft: { position: 'absolute', top: 22, left: 16 },
  // The back button sits exactly over the category pill it replaces.
  backBtn: { position: 'absolute', top: 0, left: 0 },
  chromeTopRight: {
    position: 'absolute',
    top: 22,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  // The category pill fading in on the right of the host row (where the stack was).
  hostRowPill: { position: 'absolute', right: 0 },
  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.titleLg,
    lineHeight: 26,
    letterSpacing: -0.6,
    color: COLORS.textPrimary,
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },
  hostNameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
  },
  hostName: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  hostLabel: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  goingWrap: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },
  goingText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textSecondary,
  },
  // The overlapping face rows (host row + who's-going card). Each bubble tucks
  // under the one before it — the same −9 the plain AttendeeStack uses.
  hostStack: { flexDirection: 'row', alignItems: 'center' },
  goingList: { flexDirection: 'row', alignItems: 'center' },
  stackOverlap: { marginLeft: -9 },
  goingEmpty: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
  },
  // ── Happening near you rail ─────────────────────────────────────────────────
  // Extra top margin sets it apart from the who's-going card above it.
  nearbySection: { gap: SPACING[2.5], marginTop: SPACING[2] },
  // Bleeds a touch past the content padding so a card can sit half-off the right
  // edge, hinting there's more to swipe. Trailing padding keeps the last card
  // clear of the edge.
  nearbyRail: { gap: SPACING[3], paddingRight: SPACING[5] },
  nearbyMini: {
    width: 180,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  nearbyMiniImage: { height: 104, backgroundColor: '#E3E1E4' },
  nearbyMiniPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyMiniPill: {
    position: 'absolute',
    top: SPACING[2],
    left: SPACING[2],
  },
  nearbyMiniBody: { padding: SPACING[3], gap: SPACING[0.5] },
  nearbyMiniTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
  },
  nearbyMiniMeta: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  infoRow: { flexDirection: 'row', gap: SPACING[2] },
  infoCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: RADIUS.md,
    padding: SPACING[2.5],
  },
  // Row children don't shrink by default, so without flex the text column
  // measures at full content width and spills past the card — long addresses
  // need this to ellipsize inside the tile instead of overflowing it.
  infoText: { flex: 1, minWidth: 0 },
  infoTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textPrimary,
  },
  infoSub: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.nano,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  description: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 21,
    color: '#5C5860',
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3.5] },
  spotsInfo: {},
  spotsCount: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.title,
    color: COLORS.textPrimary,
  },
  spotsLeft: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.nano,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  sectionLabel: { marginBottom: SPACING[2] },
  // The frosted "who's going" card that sits in the action stack.
  // The shadow half. Deliberately does NOT clip: Android's elevation shadow is
  // clipped away by `overflow: 'hidden'`, so the shadow and the clip have to be
  // two elements. Same split `Glass` uses, for the same reason.
  goingCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    // A white card on a white sheet needs a shadow to read as a card at all.
    shadowColor: '#0F182C',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  // The clip half, and what makes the rows appear from the card's own border
  // rather than from somewhere off-screen.
  goingCardClip: {
    padding: GOING_CARD_PAD,
    gap: SPACING[2.5],
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    overflow: 'hidden',
  },
  goingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  // minWidth 0 so a long name truncates instead of shoving the Host tag out of
  // the card — the row is inside a clip now, so an overflow would be cut, not
  // merely ugly.
  goingRowText: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  goingRowName: {
    flexShrink: 1,
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  // Invite / See all. Same height as a person row so the card reads as one
  // stack rather than a list with a footer bolted on.
  goingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    minHeight: 36,
  },
  // A coral disc the size of an avatar, so the invite row lines up with the
  // faces above it instead of starting at the text.
  goingActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goingActionLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.primary,
  },
  goingCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goingCardCount: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },
  // The not-joined card's one row: face pile on the left, gate on the right.
  goingCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[2],
  },
  goingCardLink: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.primary,
  },
  // Left-aligned by default, since on the member card it is a row in a stack.
  goingCardHint: {
    flexShrink: 1,
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  // …but right-aligned in the not-joined card, where it is the second column
  // beside the face pile.
  goingStackHint: { textAlign: 'right' },
  pendingSection: { gap: SPACING[2] },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING[2.5],
  },
  pendingNameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
  },
  pendingName: {
    flexShrink: 1,
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  approveBtn: {
    height: 34,
    paddingHorizontal: SPACING[3.5],
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: {
    fontFamily: FONTS.bold,
    color: '#fff',
    fontSize: TYPE_SIZE.caption,
  },
  rejectBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.xs,
    backgroundColor: '#F0F1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { gap: SPACING[2.5], marginTop: SPACING[1] },
  premiumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING[1.5],
    paddingHorizontal: SPACING[2.5],
    paddingVertical: SPACING[1.5],
    borderRadius: RADIUS.full,
    backgroundColor: PREMIUM_GOLD_TINT,
  },
  premiumPillText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: PREMIUM_GOLD,
  },
  womenOnlyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING[1.5],
    paddingHorizontal: SPACING[2.5],
    paddingVertical: SPACING[1.5],
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(149,9,82,0.10)',
  },
  womenOnlyText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.secondary,
  },
  // On-photo frosted chip for the banner's wishlist/share buttons.
  chip: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Leave flow ──────────────────────────────────────────────────────────────
  leaveTitle: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.title,
    letterSpacing: -0.4,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  leaveBody: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[2],
  },
  leaveDialogButtons: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: SPACING[2.5],
    marginTop: SPACING[5],
  },
  reasonSheet: { padding: SPACING[5], gap: SPACING[3] },
  reasonChips: { gap: SPACING[2] },
  reasonChip: {
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.surface,
  },
  reasonChipOn: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.background,
  },
  reasonChipText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textSecondary,
  },
  reasonChipTextOn: { fontFamily: FONTS.bold, color: COLORS.textPrimary },
  // Rendered inside BottomSheetFooter, which handles positioning — the style
  // only shapes the pill itself.
  toast: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[4],
    height: 42,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
    shadowColor: '#0F182C',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  toastText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: '#fff',
  },
});
