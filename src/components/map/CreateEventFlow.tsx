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
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
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
  fmtDayShort,
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

// Wheel options. Built from `now` rather than module load so a session left
// open overnight does not offer yesterday.
function dayOptions(now: Date) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return Array.from({ length: DATE_WINDOW_DAYS }, (_, i) => {
    const d = new Date(midnight);
    d.setDate(d.getDate() + i);
    return {
      value: d.getTime(),
      label:
        i === 0
          ? 'Today'
          : i === 1
            ? 'Tomorrow'
            : d.toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              }),
    };
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
function Wheel<T extends string | number>({
  options,
  value,
  onChange,
  width,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  width?: number;
}) {
  // Opening scrolled to the current value is most of the point of a wheel — it
  // shows where you sit in the range, not just what you picked. -1 guards a
  // value that has fallen out of the list (a date that has since passed).
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  function settle(y: number) {
    const i = Math.min(options.length - 1, Math.max(0, Math.round(y / WHEEL_ITEM_H)));
    const next = options[i]?.value;
    if (next !== undefined && next !== value) {
      Haptics.selectionAsync();
      onChange(next);
    }
  }

  return (
    <View style={[styles.wheelWrap, width != null && { width }]}>
      {/* Behind the list and never moving; the labels travel under it. Behind,
          so it cannot intercept the drag. */}
      <View style={styles.wheelBand} pointerEvents="none" />
      <ScrollView
        style={styles.wheelScroll}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: index * WHEEL_ITEM_H }}
        contentContainerStyle={styles.wheelContent}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        // A slow drag that never builds momentum ends here instead.
        onScrollEndDrag={(e) => settle(e.nativeEvent.contentOffset.y)}
      >
        {options.map((o) => (
          <View key={String(o.value)} style={styles.wheelItem}>
            <Text
              style={[
                styles.wheelLabelOff,
                o.value === value && styles.wheelLabelOn,
              ]}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// How far ahead an event can be scheduled. Long enough for a season, short
// enough that the date wheel stays a wheel rather than a calendar.
const DATE_WINDOW_DAYS = 90;
const TIME_STEP_MIN = 30;

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
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={styles.sectionPillRow}
                          contentContainerStyle={styles.sectionPillContent}
                        >
                          {[{ id: 'all' as const, label: 'All' }, ...SECTIONS].map(
                            (s) => {
                              const sel = sectionFilter === s.id;
                              return (
                                <PressableScale
                                  key={s.id}
                                  scaleTo={TAP_SCALE}
                                  style={[
                                    styles.sectionPill,
                                    sel && styles.sectionPillActive,
                                  ]}
                                  onPress={() => {
                                    Haptics.selectionAsync();
                                    setSectionFilter(s.id);
                                  }}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: sel }}
                                >
                                  <Text
                                    style={[
                                      styles.sectionPillText,
                                      sel && styles.sectionPillTextActive,
                                    ]}
                                  >
                                    {s.label}
                                  </Text>
                                </PressableScale>
                              );
                            }
                          )}
                        </ScrollView>
                        <ScrollView
                          style={styles.typeScroll}
                          contentContainerStyle={styles.typeScrollContent}
                          showsVerticalScrollIndicator={false}
                        >
                          <View style={styles.typeGrid}>
                            {visibleActivities.map((a) => {
                              const sel = activity === a.id;
                              return (
                                <PressableScale
                                  key={a.id}
                                  // 0.9 was a 10% dip where the rest of the app
                                  // uses 3-4%. PressableScale's spring is
                                  // underdamped, so the release overshoots in
                                  // proportion to the dip — a big scaleTo is
                                  // what made these tiles visibly bounce.
                                  scaleTo={TAP_SCALE}
                                  style={styles.typeItem}
                                  onPress={() => {
                                    Haptics.selectionAsync();
                                    setActivity(a.id);
                                  }}
                                >
                                  {/* One treatment for every type. Per-category
                                      tint and accent made the grid read as
                                      twenty different components; selection is
                                      a weight change now, not a hue change. */}
                                  <View
                                    style={[
                                      styles.typeTile,
                                      sel && styles.typeTileOn,
                                    ]}
                                  >
                                    <Text style={styles.typeEmoji}>{a.emoji}</Text>
                                  </View>
                                  <Text
                                    style={[
                                      styles.typeLabel,
                                      sel && styles.typeLabelOn,
                                    ]}
                                    numberOfLines={1}
                                  >
                                    {a.label}
                                  </Text>
                                </PressableScale>
                              );
                            })}
                            {/* Keeps a short last row left-aligned under
                                space-between instead of spreading it out. */}
                            {Array.from({
                              length: (4 - (visibleActivities.length % 4)) % 4,
                            }).map((_, i) => (
                              <View key={`spacer-${i}`} style={styles.typeItem} />
                            ))}
                          </View>
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
                            {fmtDayShort(startDate)}
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
                          <View style={styles.peopleValueWrap}>
                            <Text style={styles.peopleValue}>{maxPeopleNum}</Text>
                            <Text style={styles.peopleUnit}>people incl. you</Text>
                          </View>
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
                        ) : (
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
                        )}
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
        <Sheet visible={startOpen} onClose={() => setStartOpen(false)}>
          <View style={styles.sheetBody}>
            <Text style={styles.sheetTitle}>Starts</Text>
            <View style={styles.wheelRow}>
              <Wheel
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

        <Sheet visible={durationOpen} onClose={() => setDurationOpen(false)}>
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
  sectionPillActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
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
  // Bare emoji, no plate. Only the selected type gets a tinted container.
  typeTile: {
    width: 58,
    height: 58,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  // Selection is a lift, not a colour: the same translucent step every other
  // picked surface in the flow uses, with the app black to mark it.
  typeTileOn: {
    backgroundColor: COLORS.inkFaint,
    borderColor: COLORS.accent,
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
  peopleValueWrap: { alignItems: 'center' },
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
  wheelWrap: { flex: 1, height: WHEEL_H, marginVertical: SPACING[3] },
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
  wheelLabelOff: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  wheelLabelOn: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
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
