import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextInput,
  ScrollView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import {
  TITLE_MAX,
  DESCRIPTION_MAX,
  MIN_PEOPLE,
  MAX_PEOPLE,
  STEP_COUNT,
  clampMaxPeople,
  canAdvanceFrom,
  eventEndTime,
  isStartInPast,
} from '@/utils/eventDraft';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import MapView, { Region } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  ZoomIn,
  cancelAnimation,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { createEvent } from '@/services/events.service';
import { uploadEventPhoto } from '@/services/storage.service';
import { hasSeenSafetyFlag, markSafetyFlagSeen } from '@/services/safety';
import {
  clearEventDraft,
  loadEventDraft,
  saveEventDraft,
} from '@/services/eventDraftStore';
import { SafetyPopup, FemaleOnlyConfirmModal } from '@/components/safety';
import {
  roundUpTo30,
  fmtTime,
  fmtDayLong,
} from '@/components/DateTimeField';
import { PlaceResult } from '@/components/PlaceSearch';
import {
  ACTIVITIES,
  ACTIVITY_MAP,
  SECTIONS,
  SectionId,
} from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { ActivityId } from '@/types/models';
import {
  Avatar,
  Button,
  Dialog,
  Glass,
  Icon,
  NavButton,
  PressableScale,
  Sheet,
  Toggle,
} from '@/components/ui';
import { showError } from '@/utils/errors';

// ─── In-map event creation ───────────────────────────────────────────────────
// Replaces the old full-screen create form. The map itself is the canvas:
//   drop  → "tap anywhere" prompt; a tap plants the pin
//   form  → the pin is a FIXED overlay centred in the map area above the card;
//           panning the map moves the location under it (Uber-style), and the
//           wizard card below walks through type → name → when → details →
//           safety. The pin's emoji updates live as the type changes.
//   submit→ card drops away, the camera zooms slowly into the pin, which morphs
//           into the host's avatar with a spinning ring, then a green check.
// The MapView stays owned by map.tsx; it forwards taps / region settles / place
// searches here through the imperative ref.

export interface CreateEventFlowRef {
  handleMapPress: (coord: { latitude: number; longitude: number }) => void;
  handlePlace: (r: PlaceResult) => void;
  handleRegionSettled: (region: Region) => void;
  /** Leave create mode from outside the card — the map's close button. Routes
   *  through the same draft prompt as the card's own exit, so cancelling can
   *  never skip the save/discard question. */
  requestExit: () => void;
}

interface Props {
  active: boolean;
  mapRef: React.RefObject<MapView | null>;
  mapW: number;
  mapH: number;
  onExit: () => void;
}

const PIN_SIZE = 60;
const CIRCLE = 52;
// One tap depth for every control in the flow. It used to range 0.88–0.97 with
// no pattern, and the deepest ones read as a bounce: PressableScale's spring is
// underdamped, so the release overshoots past 1 in proportion to how far the
// press went down. Shallow dip, small overshoot.
const TAP_SCALE = 0.96;
// One glyph weight too. Icon defaults to 1.8 and NavButton draws at 2.1, so the
// back arrow came out heavier than everything beside it. 2.1 is the nav weight
// and the one that reads correctly at this size, so the rest match it.
const GLYPH_STROKE = 2.1;
// Off the RADIUS scale, which stops at 24. The profile sheet — the app's only
// other full-bleed pane rising from the bottom edge — is also 32, and matching
// it matters more here than landing on a rung: these are the same object. If a
// third one appears, this belongs in RADIUS.
const CARD_RADIUS = 32;
// First-frame fallback only. The card reports its real height through onLayout
// and `anchorY` uses that from the next frame on — this is just what to assume
// for the one frame before the measurement lands.
//
// It used to be the only source of truth, which made the pin's position (and
// therefore the coordinate the event is created at) depend on a number nobody
// re-derived when the card's chrome changed. Measuring removes both the drift
// and the per-device guesswork.
const CARD_EST_FALLBACK = 503;
// Bottom of the search row, below the safe area: SPACING[3] of top padding plus
// a 44pt control. Added to `insets.top`, so it lands correctly on every device
// rather than assuming a notch height.
const TOP_CHROME = 56;
// Map spans while placing / while zooming into the freshly hosted pin.
const PLACE_LNG_DELTA = 0.005;
const ZOOM_LNG_DELTA = 0.0022;
// Submit is a two-beat sequence: the camera closes in, and only once it has
// settled does the pin travel to centre. Running them together read as drift.
const ZOOM_MS = 950;
const PIN_DROP_MS = 420;
const DURATIONS = Array.from({ length: 24 }, (_, i) => i + 1);

// Headings live out here rather than inside each step's own JSX, so the title
// line stays put while the content below it swaps. It used to sit in a dark
// heading sheet; the sheet is gone but the reason for hoisting the strings is
// the same.
const STEP_HEADS = [
  "What's the plan?",
  'Name your event',
  'When, and how many?',
  'Add a cover photo',
  'Keep it safe',
];

function defaultStart() {
  return roundUpTo30(new Date(Date.now() + 60 * 60 * 1000));
}

// The one day label. Used by the wheel and by the STARTS row that opens it, so
// the row cannot describe the date differently from the list it came from —
// which it did: the row showed "28 Aug" while the wheel showed "Fri, 28 Aug".
function dayLabel(d: Date, today: Date): string {
  const days = Math.round(
    (new Date(d).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) /
      86_400_000
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// Wheel options. Built from `now` rather than module load so a session left
// open overnight does not offer yesterday.
function dayOptions(now: Date) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return Array.from({ length: DATE_WINDOW_DAYS }, (_, i) => {
    const d = new Date(midnight);
    d.setDate(d.getDate() + i);
    return { value: d.getTime(), label: dayLabel(d, midnight) };
  });
}

function timeOptions() {
  const perDay = (24 * 60) / TIME_STEP_MIN;
  return Array.from({ length: perDay }, (_, i) => {
    const mins = i * TIME_STEP_MIN;
    const d = new Date();
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return { value: mins, label: fmtTime(d) };
  });
}

// Progress across the top edge of the pane. It replaced a ring in the heading
// row, which went when the heading row did — there is no chrome left to hang a
// 24pt dial in. Still animated for the reason the ring was: the fill moving is
// the main "you just finished that" feedback, and a bar that snapped between
// fifths would read as a redraw rather than as progress.
//
// 4pt, not 2. At 2 it read as a rendering artefact rather than as a deliberate
// element — too fine to register as progress at a glance.
const PROGRESS_H = 4;

// Duration picker, wheel-style like the system timer: the list scrolls under a
// fixed selection band rather than laying every option out at once. Snapping is
// `snapToInterval` plus half-a-viewport of padding at each end, which is what
// lets the first and last rows reach the centre.
const WHEEL_ITEM_H = 48;
const WHEEL_VISIBLE = 5;
const WHEEL_H = WHEEL_ITEM_H * WHEEL_VISIBLE;

// One wheel, driven by a list of {value,label}. Duration, date and time are the
// same interaction — a column scrolling under a fixed band — so they are the
// same component rather than three that drift apart.
function WheelRow({
  label,
  index,
  scrollY,
}: {
  label: string;
  index: number;
  scrollY: SharedValue<number>;
}) {
  // Distance from the band, in rows. Everything below is a function of it, so
  // the column reads as a surface curving away rather than as a list where one
  // item happens to be styled differently.
  const style = useAnimatedStyle(() => {
    const d = Math.abs(scrollY.value / WHEEL_ITEM_H - index);
    return {
      opacity: interpolate(d, [0, 1, 2.5], [1, 0.5, 0.15], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(d, [0, 1, 2.5], [1, 0.86, 0.72], Extrapolation.CLAMP) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.wheelItem, style]}>
      <Text style={styles.wheelLabel} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
}

// One wheel, driven by a list of {value,label}. Duration, date and time are the
// same interaction — a column scrolling under a fixed band — so they are the
// same component rather than three that drift apart.
function Wheel<T extends string | number>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  // Opening scrolled to the current value is most of the point of a wheel — it
  // shows where you sit in the range, not just what you picked.
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const ref = useAnimatedRef<Animated.ScrollView>();
  // Drives the per-row falloff. Seeded so rows are styled correctly on the
  // first frame, before any scrolling has happened.
  const scrollY = useSharedValue(index * WHEEL_ITEM_H);
  // True while we are the ones scrolling. The programmatic glide below fires
  // another momentum-end when it lands, which would otherwise settle again.
  const settling = useRef(false);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // `snapToInterval` hands the snap to the platform, which cuts the deceleration
  // off and drops onto the nearest row — released between two, it jumps. Letting
  // momentum run out and then gliding to the nearest offset ourselves keeps the
  // whole movement continuous: it slows, then eases the rest of the way.
  function settle(y: number) {
    if (settling.current) {
      settling.current = false;
      return;
    }
    const i = Math.min(options.length - 1, Math.max(0, Math.round(y / WHEEL_ITEM_H)));
    const target = i * WHEEL_ITEM_H;
    if (Math.abs(target - y) > 0.5) {
      settling.current = true;
      ref.current?.scrollTo({ y: target, animated: true });
    }
    const next = options[i]?.value;
    if (next !== undefined && next !== value) {
      Haptics.selectionAsync();
      onChange(next);
    }
  }

  return (
    <View style={[styles.wheelWrap, style]}>
      {/* Behind the list and never moving; the labels travel under it. Behind,
          so it cannot intercept the drag. */}
      <View style={styles.wheelBand} pointerEvents="none" />
      <Animated.ScrollView
        style={styles.wheelScroll}
        ref={ref}
        showsVerticalScrollIndicator={false}
        decelerationRate="normal"
        contentOffset={{ x: 0, y: index * WHEEL_ITEM_H }}
        contentContainerStyle={styles.wheelContent}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        // A slow drag that never builds momentum ends here instead.
        onScrollEndDrag={(e) => settle(e.nativeEvent.contentOffset.y)}
      >
        {options.map((o, i) => (
          <WheelRow
            key={String(o.value)}
            label={o.label}
            index={i}
            scrollY={scrollY}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

// How far ahead an event can be scheduled. Long enough for a season, short
// enough that the date wheel stays a wheel rather than a calendar.
const DATE_WINDOW_DAYS = 90;
const TIME_STEP_MIN = 30;

// The app's travel motion — see DESIGN.md §9, "The travelling selection".
//
// The tab bar's own GLIDE is damping 19, which is right there because its chip
// only ever moves one narrow tab. A spring's overshoot is a fixed *proportion*
// of the distance travelled, so the same numbers that read as a pleasant
// settle over 60pt read as a lurch over 300 — which is exactly what the
// category row does when it jumps from one end to the other. Damping 24 puts
// the ratio just under critical: it still arrives rather than stops, and the
// overrun stays small enough not to register however far it came.
const GLIDE = { stiffness: 190, damping: 24, mass: 0.85 } as const;

// Grid travel.
//
// How much the indicator compresses while travelling.
const SQUASH = 0.08;
const GRID_COLS = 4;
// The emoji plate. The indicator is sized to it, so both have to agree.
const TILE = 58;

// The category filter row, with a selection that travels rather than a
// background that fades in and out per pill — the same idea as the tab bar's
// chip, and for the same reason: the eye can follow a thing that moves, so the
// row reads as one object instead of six.
//
// The tab bar can compute its chip's position from a fixed item width. These
// pills are label-width, so each one reports its own frame and the indicator
// interpolates between measured values.
function SectionPills({
  sections,
  value,
  onChange,
}: {
  sections: { id: SectionId | 'all'; label: string }[];
  value: SectionId | 'all';
  onChange: (id: SectionId | 'all') => void;
}) {
  const [frames, setFrames] = useState<Record<string, { x: number; w: number }>>(
    {}
  );
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  // The first measurement positions without animating, or the indicator flies
  // in from the left edge every time the step mounts.
  const placed = useRef(false);

  const frame = frames[value];
  useEffect(() => {
    if (!frame) return;
    if (!placed.current) {
      placed.current = true;
      x.value = frame.x;
      w.value = frame.w;
      return;
    }
    x.value = withSpring(frame.x, GLIDE);
    w.value = withSpring(frame.w, GLIDE);
  }, [frame, x, w]);

  const indicator = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: w.value,
  }));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.sectionPillRow}
      contentContainerStyle={styles.sectionPillContent}
    >
      {/* Behind the labels, so it can never intercept a tap. */}
      <Animated.View style={[styles.sectionIndicator, indicator]} />
      {sections.map((s) => {
        const sel = value === s.id;
        return (
          <PressableScale
            key={s.id}
            scaleTo={TAP_SCALE}
            style={styles.sectionPill}
            // Read out of the event synchronously. React pools synthetic
            // events and nulls `nativeEvent` once the handler returns, so
            // touching it inside the state updater — which runs later — throws
            // "Cannot read property 'layout' of null". The updater closes over
            // plain numbers instead.
            onLayout={(e) => {
              const { x: px, width } = e.nativeEvent.layout;
              setFrames((f) =>
                f[s.id]?.x === px && f[s.id]?.w === width
                  ? f
                  : { ...f, [s.id]: { x: px, w: width } }
              );
            }}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(s.id);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
          >
            <Text
              style={[styles.sectionPillText, sel && styles.sectionPillTextActive]}
            >
              {s.label}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

// The activity grid, with the same travelling selection as the category row.
// Straight to the target on both axes — see DESIGN.md §8.
function TypeGrid({
  activities,
  value,
  onChange,
}: {
  activities: { id: ActivityId; emoji: string; label: string }[];
  value: ActivityId | null;
  onChange: (id: ActivityId) => void;
}) {
  const [frames, setFrames] = useState<
    Record<string, { x: number; y: number; w: number }>
  >({});
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const shown = useSharedValue(0);
  // 0 at rest, 1 mid-travel.
  const squash = useSharedValue(0);
  const placed = useRef(false);
  const prevIndex = useRef<number | null>(null);

  const index = value ? activities.findIndex((a) => a.id === value) : -1;
  const frame = value ? frames[value] : undefined;

  useEffect(() => {
    if (!frame || index < 0) {
      shown.value = withTiming(0, { duration: 120 });
      prevIndex.current = null;
      placed.current = false;
      return;
    }
    const tx = frame.x + (frame.w - TILE) / 2;
    const ty = frame.y;
    shown.value = withTiming(1, { duration: 140 });

    const from = prevIndex.current;
    prevIndex.current = index;
    // First placement, or arriving from nothing: no travel to animate.
    if (!placed.current || from === null) {
      placed.current = true;
      x.value = tx;
      y.value = ty;
      return;
    }

    // Straight to the target, both axes together. An earlier version stepped
    // the axes to avoid "crossing cells that were never on the way" — but the
    // indicator is a thing moving over the grid, not a token walking through
    // it, and the diagonal is simply where it is going.
    squash.value = withSequence(
      withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
      withSpring(0, GLIDE)
    );
    x.value = withSpring(tx, GLIDE);
    y.value = withSpring(ty, GLIDE);
  }, [frame, index, x, y, shown, squash]);

  const indicator = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: 1 - squash.value * SQUASH },
    ],
    opacity: shown.value,
  }));

  return (
    <View style={styles.typeGrid}>
      {/* Behind the tiles, so it can never take a tap. */}
      <Animated.View style={[styles.typeIndicator, indicator]} pointerEvents="none" />
      {activities.map((a) => {
        const sel = value === a.id;
        return (
          <PressableScale
            key={a.id}
            scaleTo={TAP_SCALE}
            style={styles.typeItem}
            // Synchronously — React nulls nativeEvent once the handler returns.
            onLayout={(e) => {
              const { x: px, y: py, width } = e.nativeEvent.layout;
              setFrames((f) =>
                f[a.id]?.x === px && f[a.id]?.y === py
                  ? f
                  : { ...f, [a.id]: { x: px, y: py, w: width } }
              );
            }}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(a.id);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
          >
            <View style={styles.typeTile}>
              <Text style={styles.typeEmoji}>{a.emoji}</Text>
            </View>
            <Text
              style={[styles.typeLabel, sel && styles.typeLabelOn]}
              numberOfLines={1}
            >
              {a.label}
            </Text>
          </PressableScale>
        );
      })}
      {/* Keeps a short last row left-aligned under space-between instead of
          spreading it out. */}
      {Array.from({
        length: (GRID_COLS - (activities.length % GRID_COLS)) % GRID_COLS,
      }).map((_, i) => (
        <View key={`spacer-${i}`} style={styles.typeItem} />
      ))}
    </View>
  );
}

function StepProgress({ step }: { step: number }) {
  const pct = useSharedValue((step + 1) / STEP_COUNT);

  useEffect(() => {
    pct.value = withTiming((step + 1) / STEP_COUNT, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });
  }, [step, pct]);

  const fill = useAnimatedStyle(() => ({ width: `${pct.value * 100}%` }));

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, fill]} />
    </View>
  );
}

const CreateEventFlow = forwardRef<CreateEventFlowRef, Props>(
  function CreateEventFlow({ active, mapRef, mapW, mapH, onExit }, ref) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const user = useAuthStore((s) => s.user);
    const insets = useSafeAreaInsets();

    const [phase, setPhase] = useState<'drop' | 'form' | 'submit'>('drop');
    const [step, setStep] = useState(0);
    const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
    const [locationName, setLocationName] = useState('');

    const [activity, setActivity] = useState<ActivityId | null>(null);
    const [sectionFilter, setSectionFilter] = useState<SectionId | 'all'>('all');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [startDate, setStartDate] = useState<Date>(defaultStart);
    const [durationH, setDurationH] = useState(2);
    // Kept as text so the value can be typed over directly; the steppers and
    // submit path go through the clamped number.
    const [maxPeople, setMaxPeople] = useState('4');
    const [isPublic, setIsPublic] = useState(true);
    const [requiresApproval, setRequiresApproval] = useState(false);
    const [womenOnly, setWomenOnly] = useState(false);

    const [submitState, setSubmitState] = useState<'loading' | 'success'>('loading');
    const [firstHostVisible, setFirstHostVisible] = useState(false);
    const [womenOnlyConfirmVisible, setWomenOnlyConfirmVisible] = useState(false);
    const [discardVisible, setDiscardVisible] = useState(false);
    const [durationOpen, setDurationOpen] = useState(false);
    const [startOpen, setStartOpen] = useState(false);
    const [editingPeople, setEditingPeople] = useState(false);
    // The card's measured height, which is what the pin is centred against.
    const [cardH, setCardH] = useState(0);
    // True while the current form came back from storage rather than being
    // started here — drives the "draft restored" affordance.
    const [restored, setRestored] = useState(false);
    // Autosave must not run until the restore has had its turn. Otherwise the
    // debounced save of the still-blank form can beat a slow keychain read,
    // find no work, and clear the very draft that is about to be restored.
    const [draftLoaded, setDraftLoaded] = useState(false);

    const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const recentreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Every timer here outlives the frame that set it, and two of them navigate
    // or drive the camera. Leaving them armed through an unmount pushes a route
    // from a dead component.
    useEffect(
      () => () => {
        if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
        if (successTimer.current) clearTimeout(successTimer.current);
        if (recentreTimer.current) clearTimeout(recentreTimer.current);
      },
      []
    );

    // Screen point the pin hangs at while editing: horizontally centred, and
    // vertically at the exact midpoint of the visible map — between the bottom
    // of the search row and the top of the card.
    //
    // Both ends are real measurements rather than constants, which is what makes
    // this land identically on every device: the top comes from the live safe-area
    // inset, the bottom from the card's own onLayout. The old version divided by
    // a hardcoded card height, so the pin sat differently depending on how far
    // that estimate had drifted from the card actually on screen.
    const anchorX = mapW / 2;
    const topChrome = insets.top + TOP_CHROME;
    const cardTop = mapH - (cardH || CARD_EST_FALLBACK);
    const anchorY = Math.max(
      topChrome + (cardTop - topChrome) / 2,
      topChrome + PIN_SIZE / 2
    );

    const pinY = useSharedValue(anchorY);
    const pinScale = useSharedValue(0);
    const ringDeg = useSharedValue(0);

    const pinStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: pinY.value }, { scale: pinScale.value }],
    }));
    const ringStyle = useAnimatedStyle(() => ({
      transform: [{ rotate: `${ringDeg.value}deg` }],
    }));

    // Reset to a blank draft. Split out from the entry effect so "start fresh"
    // can reuse it without re-running the restore or the safety popup.
    function resetDraft() {
      setPhase('drop');
      setStep(0);
      setCoord(null);
      setLocationName('');
      setActivity(null);
      setSectionFilter('all');
      setTitle('');
      setDescription('');
      setPhotoUri(null);
      setStartDate(defaultStart());
      setDurationH(2);
      setMaxPeople('4');
      setIsPublic(true);
      setRequiresApproval(false);
      setWomenOnly(false);
      setSubmitState('loading');
      setRestored(false);
      pinScale.value = 0;
      pinY.value = anchorY;
    }

    // Entering create mode starts blank, then restores a stored draft if there
    // is one. Blank-first matters: the restore is async, so without it the form
    // would briefly show the *previous* session's fields before this one's.
    useEffect(() => {
      if (!active) return;
      resetDraft();
      setDraftLoaded(false);
      if (!user) {
        setDraftLoaded(true);
        return;
      }

      hasSeenSafetyFlag(user.id, 'first_host').then((seen) => {
        if (!seen) setFirstHostVisible(true);
      });

      // Guards against a draft landing after the user has already left, or
      // after they hit "start fresh" while the read was in flight.
      let cancelled = false;
      loadEventDraft(user.id).then((d) => {
        if (cancelled) return;
        // Arms autosave either way — a miss is as conclusive as a hit.
        setDraftLoaded(true);
        if (!d) return;
        setActivity(d.activity as ActivityId | null);
        setTitle(d.title);
        setDescription(d.description);
        setPhotoUri(d.photoUri);
        setStartDate(new Date(d.startsAt));
        setDurationH(d.durationH);
        setMaxPeople(d.maxPeople);
        setIsPublic(d.isPublic);
        setRequiresApproval(d.requiresApproval);
        setWomenOnly(d.womenOnly);
        setLocationName(d.locationName);
        setStep(d.step);
        setRestored(true);
        // Only a draft that got as far as a pin can reopen the form; without a
        // coordinate there is nothing to hang it on, so it resumes at the drop
        // prompt with the fields already filled.
        if (d.coord) {
          setCoord(d.coord);
          setPhase('form');
          pinScale.value = 1;
          pinY.value = anchorY;
          mapRef.current?.animateToRegion(
            regionForAnchor(d.coord.lat, d.coord.lng, PLACE_LNG_DELTA),
            550
          );
        }
      });
      return () => {
        cancelled = true;
      };
    }, [active]);

    // The pin is parked at whatever anchorY was when it was planted, so when the
    // measurement lands (or the card's height changes — the restored-draft row
    // adds a line) it has to travel to the new midpoint. Only while editing:
    // during submit the pin is mid-choreography and owns its own position.
    useEffect(() => {
      if (phase !== 'form') return;
      pinY.value = withTiming(anchorY, { duration: 220 });
    }, [anchorY, phase, pinY]);

    useEffect(() => {
      if (phase === 'submit' && submitState === 'loading') {
        ringDeg.value = 0;
        ringDeg.value = withRepeat(
          withTiming(360, { duration: 900, easing: Easing.linear }),
          -1
        );
      } else {
        cancelAnimation(ringDeg);
      }
    }, [phase, submitState]);

    function dismissFirstHost() {
      setFirstHostVisible(false);
      if (user) markSafetyFlagSeen(user.id, 'first_host');
    }

    // Region whose visible centre puts (lat,lng) exactly under the pin anchor.
    // The displayed latitude span follows from the longitude span and the map's
    // aspect ratio (Mercator-corrected), so the offset math matches what the
    // camera actually shows.
    function regionForAnchor(lat: number, lng: number, lngDelta: number): Region {
      const latDelta =
        lngDelta * (mapH / Math.max(mapW, 1)) * Math.cos((lat * Math.PI) / 180);
      const latOffset = ((mapH / 2 - anchorY) / mapH) * latDelta;
      return {
        latitude: lat - latOffset,
        longitude: lng,
        latitudeDelta: latDelta,
        longitudeDelta: lngDelta,
      };
    }

    async function reverseGeocode(lat: number, lng: number) {
      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: lat,
          longitude: lng,
        });
        setLocationName(
          [place?.name, place?.street, place?.city].filter(Boolean).join(', ') ||
            'Dropped pin'
        );
      } catch {
        setLocationName('Dropped pin');
      }
    }

    function plantPin(lat: number, lng: number, name?: string) {
      setCoord({ lat, lng });
      if (name) setLocationName(name);
      else reverseGeocode(lat, lng);
      mapRef.current?.animateToRegion(regionForAnchor(lat, lng, PLACE_LNG_DELTA), 550);
      if (phase === 'drop') {
        setPhase('form');
        pinY.value = anchorY;
        pinScale.value = 0.4;
        pinScale.value = withTiming(1, {
          duration: 320,
          easing: Easing.out(Easing.cubic),
        });
      }
    }

    useImperativeHandle(ref, () => ({
      handleMapPress(c) {
        // Only the first tap plants the pin; afterwards the map pans under it.
        if (phase === 'drop') plantPin(c.latitude, c.longitude);
      },
      handlePlace(r) {
        plantPin(r.lat, r.lng, r.name);
      },
      requestExit() {
        requestExit();
      },
      handleRegionSettled(region) {
        if (phase !== 'form') return;
        // The pin is glued to the anchor point, so whatever coordinate now sits
        // under it becomes the event location.
        const latOffset = ((mapH / 2 - anchorY) / mapH) * region.latitudeDelta;
        const lat = region.latitude + latOffset;
        const lng = region.longitude;
        setCoord({ lat, lng });
        if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
        geocodeTimer.current = setTimeout(() => reverseGeocode(lat, lng), 450);
      },
    }));

    async function pickPhoto() {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });
      if (!result.canceled) setPhotoUri(result.assets[0].uri);
    }

    function next() {
      setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
    }
    function back() {
      setStep((s) => Math.max(s - 1, 0));
    }

    const maxPeopleNum = clampMaxPeople(maxPeople);

    // Only the fields the user had to type or choose count as work worth
    // protecting. The date, duration and toggles all arrive pre-filled, so a
    // draft carrying nothing but defaults exits without a prompt.
    const hasWork =
      activity !== null ||
      title.trim().length > 0 ||
      description.trim().length > 0 ||
      photoUri !== null;

    function requestExit() {
      // The event is already on its way and the zoom is mid-flight; there is
      // nothing to cancel and no draft left to ask about.
      if (phase === 'submit') return;
      if (hasWork) setDiscardVisible(true);
      else onExit();
    }

    function discardDraft() {
      if (user) clearEventDraft(user.id);
      setDiscardVisible(false);
      resetDraft();
    }

    // Autosave, debounced so a keystroke does not hit the keychain on every
    // character. Every user-entered field is a dependency; nothing derived is,
    // so the draft is only rewritten when something actually changed.
    //
    // Skipped once submitting: from that point the event either exists (and the
    // draft is cleared) or failed (and the form is still standing, so the next
    // edit saves it again).
    useEffect(() => {
      if (!active || !user || phase === 'submit' || !draftLoaded) return;
      const t = setTimeout(() => {
        saveEventDraft(user.id, {
          step,
          coord,
          locationName,
          activity,
          title,
          description,
          photoUri,
          startsAt: startDate.getTime(),
          durationH,
          maxPeople,
          isPublic,
          requiresApproval,
          womenOnly,
        });
      }, 600);
      return () => clearTimeout(t);
    }, [
      active,
      user,
      phase,
      draftLoaded,
      step,
      coord,
      locationName,
      activity,
      title,
      description,
      photoUri,
      startDate,
      durationH,
      maxPeople,
      isPublic,
      requiresApproval,
      womenOnly,
    ]);

    async function handleHost() {
      if (!user || !activity || !coord) return;
      Keyboard.dismiss();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setPhase('submit');
      setSubmitState('loading');

      // Beat one: the camera closes in on the pin, which holds still at its
      // anchor. The zoom keeps the pin's coordinate under that anchor so
      // nothing slides while the map scales.
      mapRef.current?.animateToRegion(
        regionForAnchor(coord.lat, coord.lng, ZOOM_LNG_DELTA),
        ZOOM_MS
      );
      // Beat two: once the camera has settled, the pin drops to true centre.
      pinY.value = withDelay(
        ZOOM_MS,
        withTiming(mapH / 2, {
          duration: PIN_DROP_MS,
          easing: Easing.inOut(Easing.cubic),
        })
      );
      // Recentre the camera under the pin's new resting place as it travels,
      // so the coordinate stays put beneath it.
      recentreTimer.current = setTimeout(() => {
        mapRef.current?.animateToRegion(
          {
            latitude: coord.lat,
            longitude: coord.lng,
            latitudeDelta:
              ZOOM_LNG_DELTA *
              (mapH / Math.max(mapW, 1)) *
              Math.cos((coord.lat * Math.PI) / 180),
            longitudeDelta: ZOOM_LNG_DELTA,
          },
          PIN_DROP_MS
        );
      }, ZOOM_MS);

      // Let both beats land even when the network is instant.
      const minWait = new Promise((r) =>
        setTimeout(r, ZOOM_MS + PIN_DROP_MS + 250)
      );
      try {
        const create = (async () => {
          // No cover photo? The column stays null and the cards fall back to
          // the host's face at render — see `eventImageUri`. This used to copy
          // `user.photo_url` in here, which left `image_url` meaning either "a
          // photo of this event" or "a photo of the host" with no way to tell,
          // and the copy pointed at a dead file the moment that host changed
          // their avatar.
          const imageUrl = photoUri
            ? await uploadEventPhoto(user.id, photoUri)
            : undefined;
          return createEvent({
            hostId: user.id,
            activity,
            title: title.trim(),
            description: description.trim() || undefined,
            lat: coord.lat,
            lng: coord.lng,
            locationName: locationName || undefined,
            startsAt: startDate,
            endsAt: new Date(startDate.getTime() + durationH * 60 * 60 * 1000),
            requiresApproval,
            womenOnly,
            maxPeople: maxPeopleNum,
            isPublic,
            imageUrl,
          });
        })();
        const [eventId] = await Promise.all([create, minWait]);
        // The event exists now, so the draft has nothing left to protect.
        // Before navigation, so a slow write cannot outlive the screen.
        await clearEventDraft(user.id);
        queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.exploreFeed.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.myEvents.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.joinedEvents.all });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSubmitState('success');
        successTimer.current = setTimeout(() => {
          router.push(`/events/created/${eventId}`);
          onExit();
        }, 1300);
      } catch (e) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showError(e, 'Could not host event');
        // The recentre beat is still pending on the failure path; letting it
        // fire would drive the camera for an event that was never created.
        if (recentreTimer.current) clearTimeout(recentreTimer.current);
        // Fall back into the form with the pin back at its editing anchor, and
        // pull the camera back out to the span the form is composed against —
        // without this the card returns over a map still zoomed to ZOOM_LNG_DELTA.
        mapRef.current?.animateToRegion(
          regionForAnchor(coord.lat, coord.lng, PLACE_LNG_DELTA),
          400
        );
        pinY.value = withTiming(anchorY, { duration: 400 });
        setPhase('form');
      }
    }

    // Keyed on the day itself, not on the sheet opening: the 90-entry list only
    // goes stale when midnight passes, and that is exactly when this changes.
    const todayMs = new Date().setHours(0, 0, 0, 0);
    const days = useMemo(() => dayOptions(new Date(todayMs)), [todayMs]);
    const times = useMemo(() => timeOptions(), []);

    if (!active || mapW === 0 || mapH === 0) return null;

    const emoji = activity ? ACTIVITY_MAP[activity].emoji : null;
    const visibleActivities =
      sectionFilter === 'all'
        ? ACTIVITIES
        : ACTIVITIES.filter((a) => a.section === sectionFilter);
    const startInPast = isStartInPast(startDate);
    // The wheels address day and minute-of-day separately; `startDate` is the
    // single source of truth both are read back out of.
    const startDayValue = new Date(startDate).setHours(0, 0, 0, 0);
    const startMinuteValue =
      startDate.getHours() * 60 +
      Math.round(startDate.getMinutes() / TIME_STEP_MIN) * TIME_STEP_MIN;
    const nextDisabled = !canAdvanceFrom(step, { activity, title, startDate });
    const endDate = eventEndTime(startDate, durationH);
    const stepEntering = FadeIn.duration(150).easing(Easing.out(Easing.quad));

    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* "Tap anywhere" prompt */}
        {phase === 'drop' && (
          <Animated.View
            entering={FadeInDown.delay(150).duration(400)}
            exiting={FadeOut.duration(200)}
            style={styles.promptWrap}
            pointerEvents="none"
          >
            <View style={styles.promptPill}>
              <Icon name="pin" size={15} color={COLORS.primary} strokeWidth={GLYPH_STROKE} />
              <Text style={styles.promptText}>Tap anywhere to drop a pin</Text>
            </View>
          </Animated.View>
        )}

        {/* Live location under the pin. Sits directly beneath the map's search
            bar (TOP_CHROME spans that strip) rather than riding above the card,
            so the address reads next to the field you'd retype it in. */}
        {phase === 'form' && (
          <Animated.View
            entering={FadeIn.duration(220)}
            exiting={FadeOut.duration(160)}
            style={[
              styles.locationPillWrap,
              { top: insets.top + TOP_CHROME + 10 },
            ]}
            pointerEvents="none"
          >
            <View style={styles.locationPill}>
              <Icon name="location" size={13} color={COLORS.white} strokeWidth={GLYPH_STROKE} />
              <Text style={styles.locationText} numberOfLines={1}>
                {locationName || 'Locating…'}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* The pin: a bare white circle fixed to the anchor point. The map moves
            underneath it, and every edit (type, submit states) plays out inside it. */}
        {phase !== 'drop' && (
          <Animated.View
            pointerEvents="none"
            style={[styles.pinHolder, { left: anchorX - PIN_SIZE / 2 }, pinStyle]}
          >
            {phase === 'submit' && submitState === 'loading' && (
              <Animated.View
                entering={FadeIn.duration(300)}
                exiting={FadeOut.duration(250)}
                style={[styles.ring, ringStyle]}
              />
            )}
            <View style={styles.pinCircle}>
              {phase === 'submit' ? (
                <>
                  <Animated.View entering={FadeIn.duration(350)}>
                    <Avatar name={user?.name} photoUrl={user?.photo_url} size={40} />
                  </Animated.View>
                  {/* Success: the circle calmly fills green, then the tick
                      fades in — no bounce. */}
                  {submitState === 'success' && (
                    <Animated.View
                      entering={FadeIn.duration(320).easing(Easing.out(Easing.cubic))}
                      style={styles.successFill}
                    >
                      <Animated.View
                        entering={FadeIn.delay(180).duration(280)}
                      >
                        <Icon name="check" size={26} color={COLORS.white} strokeWidth={3} />
                      </Animated.View>
                    </Animated.View>
                  )}
                </>
              ) : emoji ? (
                <Animated.Text
                  key={emoji}
                  entering={ZoomIn.duration(130).easing(Easing.out(Easing.quad))}
                  style={styles.pinEmoji}
                >
                  {emoji}
                </Animated.Text>
              ) : null}
            </View>
          </Animated.View>
        )}

        {/* Wizard card */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.cardWrap}
          pointerEvents="box-none"
        >
          {phase === 'form' && (
            <Animated.View
              entering={SlideInDown.duration(380).easing(Easing.out(Easing.cubic))}
              exiting={SlideOutDown.duration(280).easing(Easing.in(Easing.cubic))}
            >
              {/* One frosted pane, not a dark band stacked on a white sheet.
                  `edge="top"` rounds the top corners and draws the hairline
                  across that edge alone — the card runs off the bottom of the
                  screen, where a corner would read as the surface stopping
                  short. Contents stay ink: this is a light tier (DESIGN.md §3
                  — white type belongs on `onPhoto` and nowhere else). */}
              <Glass
                tier="chrome"
                radius={CARD_RADIUS}
                edge="top"
                style={styles.card}
                onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
              >
                <View style={styles.cardBody}>
                  {/* Glyph and title on one line. Bare glyph, no chip —
                      AGENTS.md assigns back/close/dismiss to NavButton, and its
                      default colour is already the ink this pane wants. Step 0
                      has nothing to go back to, so it carries the close. */}
                  <View style={styles.titleRow}>
                    <NavButton
                      icon={step > 0 ? 'back' : 'close'}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (step > 0) back();
                        else requestExit();
                      }}
                      accessibilityLabel={
                        step > 0 ? 'Previous step' : 'Cancel event creation'
                      }
                      style={styles.navSlot}
                    />
                    <Text style={styles.stepTitle} numberOfLines={1}>
                      {STEP_HEADS[step]}
                    </Text>
                  </View>
                  <StepProgress step={step} />
                  {/* A form that fills itself in is alarming without a reason.
                      Sits above the steps so it reads before the fields do, and
                      offers the way out in the same breath. */}
                  {restored && (
                    <Animated.View
                      entering={FadeIn.duration(220)}
                      style={styles.restoredRow}
                    >
                      <Text style={styles.restoredText}>
                        Picked up where you left off
                      </Text>
                      <PressableScale
                        scaleTo={TAP_SCALE}
                        onPress={discardDraft}
                        accessibilityRole="button"
                        accessibilityLabel="Start a fresh event"
                        hitSlop={8}
                      >
                        <Text style={styles.restoredAction}>Start fresh</Text>
                      </PressableScale>
                    </Animated.View>
                  )}
                  {/* Steps (absolute-fill so enter/exit slides overlap cleanly) */}
                  <View style={styles.stepArea}>
                    {step === 0 && (
                      <Animated.View
                        key="s0"
                        entering={stepEntering}
                        exiting={FadeOut.duration(80)}
                        style={styles.step}
                      >
                        {/* Category pills narrow the grid down; "All" is the
                            default so nothing is hidden until you choose. */}
                        <SectionPills
                          sections={[{ id: 'all', label: 'All' }, ...SECTIONS]}
                          value={sectionFilter}
                          onChange={setSectionFilter}
                        />
                        <ScrollView
                          style={styles.typeScroll}
                          contentContainerStyle={styles.typeScrollContent}
                          showsVerticalScrollIndicator={false}
                        >
                          <TypeGrid
                            activities={visibleActivities}
                            value={activity}
                            onChange={setActivity}
                          />
                        </ScrollView>
                      </Animated.View>
                    )}

                    {step === 1 && (
                      <Animated.View
                        key="s1"
                        entering={stepEntering}
                        exiting={FadeOut.duration(80)}
                        style={styles.step}
                      >
                        <TextInput
                          style={styles.input}
                          placeholder="e.g. Sunset rooftop drinks"
                          placeholderTextColor={COLORS.placeholder}
                          value={title}
                          onChangeText={setTitle}
                          maxLength={TITLE_MAX}
                          autoFocus
                          returnKeyType="done"
                        />
                        <Text style={styles.charCount}>
                          {title.length}/{TITLE_MAX}
                        </Text>
                        <TextInput
                          style={[styles.input, styles.multiline]}
                          placeholder="Short and inviting works best."
                          placeholderTextColor={COLORS.placeholder}
                          value={description}
                          onChangeText={setDescription}
                          multiline
                          maxLength={DESCRIPTION_MAX}
                        />
                        {/* The field silently stops accepting input at the cap.
                            The title above it has always said so; this one only
                            shows the count once it is close enough to matter,
                            so an empty box is not pre-loaded with "0/500". */}
                        {description.length > DESCRIPTION_MAX * 0.8 && (
                          <Text style={styles.charCount}>
                            {description.length}/{DESCRIPTION_MAX}
                          </Text>
                        )}
                      </Animated.View>
                    )}

                    {step === 2 && (
                      <Animated.View
                        key="s2"
                        entering={stepEntering}
                        exiting={FadeOut.duration(80)}
                        style={styles.step}
                      >
                        <Text style={styles.label}>STARTS</Text>
                        {/* Non-compact datetime: one full-width row reading
                            "Saturday 3 August · 7:00 PM", opening one picker.
                            Two half-width fields side by side made the user
                            think about date and time as separate decisions. */}
                        <PressableScale
                          scaleTo={TAP_SCALE}
                          style={styles.summaryRow}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setStartOpen(true);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Starts ${fmtDayLong(startDate)} at ${fmtTime(startDate)}. Change`}
                        >
                          <Text style={styles.summaryValue}>
                            {dayLabel(startDate, new Date(todayMs))}
                          </Text>
                          <Text style={styles.summaryMeta}>
                            {fmtTime(startDate)}
                          </Text>
                          <Icon
                            name="chevronRight"
                            size={16}
                            color={COLORS.textMuted}
                            strokeWidth={GLYPH_STROKE}
                          />
                        </PressableScale>
                        {/* The Next button goes dead on a past start; say why,
                            or the step reads as broken. */}
                        {startInPast && (
                          <Text style={styles.warning}>
                            That start time has already passed — pick a later
                            one.
                          </Text>
                        )}

                        <Text style={styles.label}>LASTS FOR</Text>
                        {/* A summary row, not 24 chips in a horizontal
                            scroller. The scroller put every option on screen at
                            once and made the common ones as hard to reach as
                            the rare ones; this shows the answer and hides the
                            choosing until it is asked for. */}
                        <PressableScale
                          scaleTo={TAP_SCALE}
                          style={styles.summaryRow}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setDurationOpen(true);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Lasts ${durationH} hours. Change`}
                        >
                          <Text style={styles.summaryValue}>
                            {durationH}
                            {durationH === 1 ? ' hour' : ' hours'}
                          </Text>
                          <Text style={styles.summaryMeta}>
                            until {fmtTime(endDate)}
                          </Text>
                          <Icon
                            name="chevronRight"
                            size={16}
                            color={COLORS.textMuted}
                            strokeWidth={GLYPH_STROKE}
                          />
                        </PressableScale>

                        <Text style={styles.label}>PEOPLE</Text>
                        {/* Steppers only. The free-text field it replaces took
                            any two digits and silently rewrote them on blur,
                            which is why it needed a hint explaining the clamp;
                            a control that cannot go out of range needs no
                            explanation. */}
                        <View style={styles.peopleRow}>
                          <PressableScale
                            scaleTo={TAP_SCALE}
                            style={[
                              styles.stepperBtn,
                              maxPeopleNum <= MIN_PEOPLE && styles.stepperBtnOff,
                            ]}
                            disabled={maxPeopleNum <= MIN_PEOPLE}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setMaxPeople(String(maxPeopleNum - 1));
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="One fewer person"
                          >
                            <Icon name="minus" size={20} color={COLORS.white} strokeWidth={2.6} />
                          </PressableScale>
                          {/* Tap the number to type it. The steppers are right
                              for nudging by one and wrong for going from 4 to
                              30, which is why the free-text field this replaced
                              existed at all — but it is only a field while it
                              is being edited, so the clamp still cannot bite
                              silently: it applies on blur, in view. */}
                          <PressableScale
                            scaleTo={TAP_SCALE}
                            style={styles.peopleValueWrap}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setEditingPeople(true);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`${maxPeopleNum} people. Tap to type a number`}
                          >
                            {editingPeople ? (
                              <TextInput
                                style={styles.peopleInput}
                                value={maxPeople}
                                onChangeText={(t) =>
                                  setMaxPeople(t.replace(/[^0-9]/g, '').slice(0, 2))
                                }
                                onBlur={() => {
                                  setMaxPeople(String(maxPeopleNum));
                                  setEditingPeople(false);
                                }}
                                keyboardType="number-pad"
                                returnKeyType="done"
                                selectTextOnFocus
                                autoFocus
                              />
                            ) : (
                              <Text style={styles.peopleValue}>{maxPeopleNum}</Text>
                            )}
                            <Text style={styles.peopleUnit}>people incl. you</Text>
                          </PressableScale>
                          <PressableScale
                            scaleTo={TAP_SCALE}
                            style={[
                              styles.stepperBtn,
                              maxPeopleNum >= MAX_PEOPLE && styles.stepperBtnOff,
                            ]}
                            disabled={maxPeopleNum >= MAX_PEOPLE}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setMaxPeople(String(maxPeopleNum + 1));
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="One more person"
                          >
                            <Icon name="plus" size={20} color={COLORS.white} strokeWidth={2.6} />
                          </PressableScale>
                        </View>
                      </Animated.View>
                    )}

                    {step === 3 && (
                      <Animated.View
                        key="s3"
                        entering={stepEntering}
                        exiting={FadeOut.duration(80)}
                        style={styles.step}
                      >
                        {photoUri ? (
                          <View style={styles.photoWrap}>
                            <Image
                              source={{ uri: photoUri }}
                              style={styles.photoPreview}
                              contentFit="cover"
                            />
                            <PressableScale
                              scaleTo={TAP_SCALE}
                              style={styles.photoRemove}
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setPhotoUri(null);
                              }}
                              accessibilityLabel="Remove photo"
                            >
                              <Icon name="close" size={14} color={COLORS.white} strokeWidth={2.5} />
                            </PressableScale>
                          </View>
                        ) : null}
                        {/* The X on the corner removes; swapping one photo for
                            another had meant removing first and then finding
                            the picker again. This is the action people actually
                            want after seeing the preview. */}
                        {photoUri ? (
                          <Button
                            variant="tertiary"
                            size="md"
                            label="Replace photo"
                            onPress={pickPhoto}
                          />
                        ) : null}
                        {!photoUri ? (
                          <PressableScale
                            scaleTo={TAP_SCALE}
                            style={styles.photoEmpty}
                            onPress={pickPhoto}
                            accessibilityRole="button"
                            accessibilityLabel="Add a cover photo"
                          >
                            <View style={styles.photoEmptyIcon}>
                              <Icon name="camera" size={22} color={COLORS.primary} strokeWidth={GLYPH_STROKE} />
                            </View>
                            <Text style={styles.photoEmptyTitle}>Choose a photo</Text>
                            <Text style={styles.photoEmptySub}>
                              Adding a photo increases the chances of people
                              joining your event.
                            </Text>
                          </PressableScale>
                        ) : null}
                        {!photoUri && (
                          <View style={styles.photoFallback}>
                            <Avatar
                              name={user?.name}
                              photoUrl={user?.photo_url}
                              size={34}
                            />
                            <Text style={styles.photoFallbackText}>
                              If you skip this, we&apos;ll use your profile picture
                              as the event photo.
                            </Text>
                          </View>
                        )}
                      </Animated.View>
                    )}

                    {step === 4 && (
                      <Animated.View
                        key="s4"
                        entering={stepEntering}
                        exiting={FadeOut.duration(80)}
                        style={styles.step}
                      >
                        <View style={styles.safetyRow}>
                          <View style={{ flex: 1, paddingRight: SPACING[3] }}>
                            <Text style={styles.safetyLabel}>Public event</Text>
                            <Text style={styles.safetySub}>
                              {isPublic
                                ? 'Visible to everyone on the map'
                                : 'Only friends can see'}
                            </Text>
                          </View>
                          <Toggle
                            value={isPublic}
                            onValueChange={setIsPublic}
                            accessibilityLabel="Public event"
                          />
                        </View>
                        <View style={styles.safetyRow}>
                          <View style={{ flex: 1, paddingRight: SPACING[3] }}>
                            <Text style={styles.safetyLabel}>Approve who joins</Text>
                            <Text style={styles.safetySub}>
                              {requiresApproval
                                ? 'You approve each person'
                                : 'Anyone can join instantly'}
                            </Text>
                          </View>
                          <Toggle
                            value={requiresApproval}
                            onValueChange={setRequiresApproval}
                            accessibilityLabel="Approve who joins"
                          />
                        </View>
                        {/* Female-only hosting is offered to female profiles only. */}
                        {user?.gender === 'female' && (
                          <View style={styles.safetyRow}>
                            <View style={{ flex: 1, paddingRight: SPACING[3] }}>
                              <Text style={styles.safetyLabel}>Female-only event</Text>
                              <Text style={styles.safetySub}>
                                {womenOnly
                                  ? 'Only women can see and join'
                                  : 'Anyone can see and join'}
                              </Text>
                            </View>
                            <Toggle
                              value={womenOnly}
                              onValueChange={(on) =>
                                on ? setWomenOnlyConfirmVisible(true) : setWomenOnly(false)
                              }
                              accessibilityLabel="Female-only event"
                            />
                          </View>
                        )}
                      </Animated.View>
                    )}
                  </View>

                  <Button
                    variant="primary"
                    label={step === STEP_COUNT - 1 ? 'Host event' : 'Next'}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      if (step === STEP_COUNT - 1) handleHost();
                      else next();
                    }}
                    disabled={nextDisabled}
                  />
                </View>
              </Glass>
            </Animated.View>
          )}
        </KeyboardAvoidingView>

        {/* Safety popup #2: hosting your first event (once ever). */}
        <SafetyPopup
          visible={firstHostVisible}
          icon="pin"
          title="Hosting? Here's how to do it well"
          body={[
            'Pick a public, easy-to-find spot for open events.',
            "Be honest about the vibe and who it's for.",
            "You're in charge — you can remove or report anyone.",
          ]}
          primaryLabel="Start hosting"
          onPrimary={dismissFirstHost}
          onClose={dismissFirstHost}
        />

        {/* Every hour still selectable — the horizontal scroller was the
            problem, not the range. Wrapped into a grid, all 24 are reachable
            without dragging and the short ones are where the thumb already is. */}
        {/* Date and time as two columns of the same wheel, so picking a start
            is one gesture language rather than a calendar plus a grid. Day and
            minute-of-day are kept apart and recombined on change — a single
            list of every slot in 90 days would be 4,320 rows. */}
        <Sheet
          visible={startOpen}
          animation="slide"
          grabber
          onClose={() => setStartOpen(false)}
        >
          <View style={styles.sheetBody}>
            <Text style={styles.sheetTitle}>Starts</Text>
            <View style={styles.wheelRow}>
              <Wheel
                style={styles.wheelFlex}
                options={days}
                value={startDayValue}
                onChange={(ms) => {
                  const d = new Date(ms as number);
                  const next = new Date(startDate);
                  next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                  setStartDate(next);
                }}
              />
              <Wheel
                style={styles.wheelFlex}
                options={times}
                value={startMinuteValue}
                onChange={(mins) => {
                  const next = new Date(startDate);
                  next.setHours(
                    Math.floor((mins as number) / 60),
                    (mins as number) % 60,
                    0,
                    0
                  );
                  setStartDate(next);
                }}
              />
            </View>
            {startInPast && (
              <Text style={styles.warning}>
                That start time has already passed — pick a later one.
              </Text>
            )}
            <Button
              variant="secondary"
              label="Done"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStartOpen(false);
              }}
            />
          </View>
        </Sheet>

        <Sheet
          visible={durationOpen}
          animation="slide"
          grabber
          onClose={() => setDurationOpen(false)}
        >
          {/* Sheet supplies no horizontal padding — callers own their own
              gutters — so the content sets them here. */}
          <View style={styles.sheetBody}>
            <Text style={styles.sheetTitle}>Lasts for</Text>
            <Wheel
              options={DURATIONS.map((h) => ({
                value: h,
                label: `${h} ${h === 1 ? 'hour' : 'hours'}`,
              }))}
              value={durationH}
              onChange={setDurationH}
            />
            <Button
              variant="secondary"
              label="Done"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDurationOpen(false);
              }}
            />
          </View>
        </Sheet>

        {/* Leaving now keeps the draft, so the question is no longer "lose this
            work?" but "which did you mean?" — the destructive option has to be
            the explicit one. Kept local rather than promoted to ui/: one caller. */}
        <Dialog visible={discardVisible} onClose={() => setDiscardVisible(false)}>
          <Text style={styles.discardTitle}>Leave this event?</Text>
          <Text style={styles.discardBody}>
            We&apos;ll keep your draft so you can pick it up later.
          </Text>
          <View style={styles.discardRow}>
            <PressableScale
              scaleTo={TAP_SCALE}
              style={[styles.discardBtn, styles.discardKeep]}
              onPress={() => {
                setDiscardVisible(false);
                onExit();
              }}
              accessibilityRole="button"
              accessibilityLabel="Save for later"
            >
              <Text style={styles.discardKeepLabel}>Save for later</Text>
            </PressableScale>
            <PressableScale
              scaleTo={TAP_SCALE}
              style={[styles.discardBtn, styles.discardGo]}
              onPress={() => {
                discardDraft();
                onExit();
              }}
              accessibilityRole="button"
              accessibilityLabel="Discard draft"
            >
              <Text style={styles.discardGoLabel}>Discard</Text>
            </PressableScale>
          </View>
        </Dialog>

        {/* Safety popup #9: confirm creating a female-only event (every time). */}
        <FemaleOnlyConfirmModal
          visible={womenOnlyConfirmVisible}
          onConfirm={() => {
            setWomenOnly(true);
            setWomenOnlyConfirmVisible(false);
          }}
          onBack={() => {
            setWomenOnly(false);
            setWomenOnlyConfirmVisible(false);
          }}
        />
      </View>
    );
  }
);

export default CreateEventFlow;

const styles = StyleSheet.create({
  promptWrap: {
    position: 'absolute',
    top: 130,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  promptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING[4],
    height: 40,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  promptText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
  },
  pinHolder: {
    position: 'absolute',
    top: -PIN_SIZE / 2,
    width: PIN_SIZE,
    height: PIN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: COLORS.ink,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  pinEmoji: { fontSize: TYPE_SIZE.h1, lineHeight: 34 },
  ring: {
    position: 'absolute',
    width: PIN_SIZE + 6,
    height: PIN_SIZE + 6,
    borderRadius: (PIN_SIZE + 6) / 2,
    borderWidth: 3,
    borderColor: COLORS.primaryTrack,
    borderTopColor: COLORS.primary,
  },
  successFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: CIRCLE / 2,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Fill, hairline and radius all come from <Glass> now. What stays here is
  // layout plus the shadow: the design's standard SHADOWS.glass throws
  // downward, and this card's only exposed edge is its top, so it keeps the
  // upward throw it was drawn with. Glass puts `style` on the unclipped outer
  // view precisely so a caller can do this.
  card: {
    paddingBottom: SPACING[7],
    shadowColor: COLORS.ink,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    marginTop: SPACING[1],
    marginBottom: SPACING[2],
  },
  // Pulled left so the glyph's optical edge lines up with the content column
  // below it rather than with its own 40pt touch box.
  navSlot: { marginLeft: -SPACING[2.5] },
  // Below the title row rather than in the card's top edge. That is where it
  // belongs — it describes the step you are reading, not the pane — and it also
  // retires the corner problem entirely: away from the radius there is no curve
  // to follow, so the bar is just a bar with rounded ends.
  progressTrack: {
    height: PROGRESS_H,
    borderRadius: PROGRESS_H / 2,
    backgroundColor: COLORS.inkFaint,
    overflow: 'hidden',
    marginBottom: SPACING[3],
  },
  progressFill: {
    height: PROGRESS_H,
    borderRadius: PROGRESS_H / 2,
    backgroundColor: COLORS.primary,
  },
  cardBody: { paddingHorizontal: SPACING[5], paddingTop: SPACING[2] },
  // Floats free under the search bar; `top` is supplied at render from the
  // safe-area inset so it clears the notch on every device.
  locationPillWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    maxWidth: '86%',
    height: 34,
    paddingHorizontal: SPACING[3.5],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  locationText: {
    flexShrink: 1,
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.white,
  },
  // Sized to the tallest step (the when-step: three labelled groups).
  // It was 268, which the when-step overran — the people row was being
  // cut off by the Next button sitting under it.
  stepArea: { height: 316, marginBottom: SPACING[3] },
  step: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // Ordinary content now rather than a label on a dark band: left-aligned and
  // ink, sharing the glyph's line. Same size as before so the step-to-step
  // rhythm is unchanged.
  stepTitle: {
    flex: 1,
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.sectionLg,
    color: COLORS.textPrimary,
  },
  sectionPillRow: { flexGrow: 0, marginTop: SPACING[3], marginHorizontal: -20 },
  sectionPillContent: { paddingHorizontal: SPACING[5], gap: SPACING[2] },
  sectionPill: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: SPACING[3.5],
    borderRadius: RADIUS.full,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  // The travelling selection. Absolute inside the scroll content so it shares
  // the pills' coordinate space, and behind them so it cannot take a tap.
  sectionIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
  },
  sectionPillText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  sectionPillTextActive: { fontFamily: FONTS.bold, color: COLORS.white },
  typeScroll: { flex: 1, marginTop: SPACING[3], marginHorizontal: -4 },
  // The top padding is not decoration. PressableScale springs back underdamped,
  // so a tile briefly scales *past* 1 on release; without headroom the scroll
  // view clips that overshoot and the first row's tiles lose their top edge
  // mid-bounce. The padding is the room the overshoot needs.
  typeScrollContent: {
    paddingHorizontal: SPACING[1],
    paddingTop: SPACING[1],
    paddingBottom: SPACING[2],
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: SPACING[3.5],
  },
  typeItem: { width: '23%', alignItems: 'center', gap: SPACING[1.5] },
  // The travelling selection, sized to the emoji plate and sitting behind it.
  typeIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: TILE,
    height: TILE,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.inkFaint,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  // Bare emoji, no plate. Only the selected type gets a tinted container.
  typeTile: {
    width: TILE,
    height: TILE,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeEmoji: { fontSize: TYPE_SIZE.h1, lineHeight: 34 },
  typeLabel: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.inkLabel,
  },
  typeLabelOn: { fontFamily: FONTS.bold, color: COLORS.textPrimary },
  input: {
    height: 50,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING[3.5],
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textPrimary,
    marginTop: SPACING[4],
  },
  multiline: {
    height: undefined,
    minHeight: 88,
    paddingVertical: SPACING[3],
    textAlignVertical: 'top',
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    marginTop: SPACING[3],
  },
  charCount: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: SPACING[1.5],
  },
  label: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    letterSpacing: 0.3,
    color: COLORS.inkLabel,
    // Generous above, tight below: the gap separates one group from the last,
    // while the label stays visually attached to the control it names.
    marginTop: SPACING[5],
    marginBottom: SPACING[1],
  },
  warning: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.error,
    marginTop: SPACING[1.5],
  },
  restoredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[2],
    marginBottom: SPACING[3],
  },
  restoredText: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
  },
  restoredAction: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.primary,
  },

  // Discard confirm — same shape and tokens as the community delete confirm, so
  // the two destructive prompts in the app read identically.
  discardTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  discardBody: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[2],
  },
  discardRow: {
    flexDirection: 'row',
    gap: SPACING[2],
    alignSelf: 'stretch',
    marginTop: SPACING[4],
  },
  discardBtn: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardKeep: { backgroundColor: COLORS.inkSubtle },
  discardKeepLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  discardGo: { backgroundColor: COLORS.error },
  discardGoLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.white,
  },
  // A value the user can read at a glance with the choosing tucked behind it.
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    height: 52,
    paddingHorizontal: SPACING[4],
    borderRadius: RADIUS.md,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING[1],
  },
  summaryValue: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  summaryMeta: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
  // No tray. The two buttons carry the weight on their own, so the row reads as
  // a control rather than as another filled field stacked under the two above.
  peopleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    marginTop: SPACING[1],
  },
  peopleValueWrap: { alignItems: 'center', minWidth: 96 },
  // Same metrics as the label it replaces, so swapping between them does not
  // shift the row.
  peopleInput: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    color: COLORS.textPrimary,
    textAlign: 'center',
    padding: 0,
    minWidth: 60,
  },
  // Bigger now that there is no tray holding the row together — the number is
  // what carries it, so it has to be the thing the eye lands on.
  peopleValue: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    color: COLORS.textPrimary,
  },
  peopleUnit: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
  },
  sheetBody: { paddingHorizontal: SPACING[5], paddingTop: SPACING[5] },
  sheetTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.sectionLg,
    color: COLORS.textPrimary,
  },
  // No flex here. In the duration sheet the wheel is a column child, where
  // flex: 1 sets flexBasis 0 and overrides this height — inside an unbounded
  // parent that collapses the wheel to nothing. Columns that want it to share
  // width pass wheelFlex instead.
  wheelWrap: { height: WHEEL_H, marginVertical: SPACING[3] },
  wheelFlex: { flex: 1 },
  // Two wheels abreast for date + time; the band spans each column separately
  // so the pair reads as one control rather than two stacked lists.
  wheelRow: { flexDirection: 'row', gap: SPACING[3] },
  // Explicit height. Without it the ScrollView sizes to its content, lays all
  // 24 rows out and has nothing left to scroll — which is exactly how it shipped.
  wheelScroll: { height: WHEEL_H },
  // Half a viewport of padding at each end, so the first and last rows can
  // reach the centre band instead of stopping at the edge.
  wheelContent: { paddingVertical: (WHEEL_H - WHEEL_ITEM_H) / 2 },
  wheelItem: { height: WHEEL_ITEM_H, justifyContent: 'center' },
  // Outlined, not filled — the band marks where the selection is without
  // painting a block behind the number.
  wheelBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: (WHEEL_H - WHEEL_ITEM_H) / 2,
    height: WHEEL_ITEM_H,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  // One style for every row. Emphasis comes from the scroll-driven scale and
  // opacity, not from swapping the selected row's font — which was what made
  // the column jump as a value passed under the band.
  wheelLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  // The app black, per the button rule: this is a workhorse control, not a
  // primary action, and coral here would compete with Next.
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnOff: { opacity: 0.4 },
  photoWrap: { marginTop: SPACING[4], borderRadius: RADIUS.lg, overflow: 'hidden' },
  photoPreview: { width: '100%', height: 180 },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.glassOnPhoto,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmpty: {
    alignItems: 'center',
    gap: SPACING[1],
    marginTop: SPACING[4],
    paddingVertical: SPACING[7],
    paddingHorizontal: SPACING[7],
    borderRadius: RADIUS.xl,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  photoEmptyIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[2],
  },
  photoEmptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  photoEmptySub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 17,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  // Pinned to the bottom of the step area and run 24pt past it, so the Next
  // button (a later sibling, painted on top) covers the square bottom edge and
  // the notice reads as one tray tucked behind it.
  photoFallback: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    paddingHorizontal: SPACING[3],
    paddingTop: SPACING[3],
    paddingBottom: SPACING[8],
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: COLORS.inkFaint,
  },
  photoFallbackText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 17,
    color: COLORS.textSecondary,
  },
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING[3.5],
  },
  safetyLabel: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  safetySub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
});
