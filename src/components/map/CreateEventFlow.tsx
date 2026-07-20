import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  ScrollView,
  Switch,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Region } from 'react-native-maps';
import Svg, { Circle } from 'react-native-svg';
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
  useAnimatedProps,
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
import { SafetyPopup, FemaleOnlyConfirmModal } from '@/components/safety';
import DateTimeField, { roundUpTo30, fmtDayShort, fmtTime } from '@/components/DateTimeField';
import { PlaceResult } from '@/components/PlaceSearch';
import {
  ACTIVITIES,
  ACTIVITY_MAP,
  SECTIONS,
  SectionId,
} from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { ActivityId } from '@/types/models';
import { Avatar, Button, Icon, PressableScale } from '@/components/ui';

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
}

interface Props {
  active: boolean;
  mapRef: React.RefObject<MapView | null>;
  mapW: number;
  mapH: number;
  onExit: () => void;
}

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 500;
const STEP_COUNT = 5;
const PIN_SIZE = 60;
const CIRCLE = 52;
// Rough card height (dark heading sheet + body + button) plus the location
// pill riding above it, used to centre the pin in the map strip left over.
const CARD_EST = 495;
// The search bar floats over the top of the map (safe area + 12pt pad + a 44pt
// row), so that strip isn't really free space. Centring the pin has to discount
// it or the pin rides visibly high.
const TOP_CHROME = 56;
// Map spans while placing / while zooming into the freshly hosted pin.
const PLACE_LNG_DELTA = 0.005;
const ZOOM_LNG_DELTA = 0.0022;
// Submit is a two-beat sequence: the camera closes in, and only once it has
// settled does the pin travel to centre. Running them together read as drift.
const ZOOM_MS = 950;
const PIN_DROP_MS = 420;
const DURATIONS = Array.from({ length: 24 }, (_, i) => i + 1);

// Step headings live in the dark sheet at the top of the card rather than
// inside each step, so the heading block stays put while the content swaps.
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

// Progress ring in the heading row: an arc that fills a fifth per step.
const RING_SIZE = 24;
const RING_STROKE = 3;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// The arc sweeps to its new length whenever a step is completed, rather than
// snapping — the fill is the main "you just finished that" feedback.
function StepRing({ step }: { step: number }) {
  const progress = useSharedValue((step + 1) / STEP_COUNT);
  const half = RING_SIZE / 2;

  useEffect(() => {
    progress.value = withTiming((step + 1) / STEP_COUNT, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });
  }, [step]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_C * (1 - progress.value),
  }));

  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <Circle
        cx={half}
        cy={half}
        r={RING_R}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={RING_STROKE}
        fill="none"
      />
      <AnimatedCircle
        cx={half}
        cy={half}
        r={RING_R}
        stroke={COLORS.primary}
        strokeWidth={RING_STROKE}
        fill="none"
        strokeDasharray={`${RING_C}`}
        animatedProps={arcProps}
        strokeLinecap="round"
        transform={`rotate(-90 ${half} ${half})`}
      />
    </Svg>
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

    const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Screen point the pin overlay hangs at while editing: horizontally centred,
    // vertically in the middle of the map strip that stays visible above the card.
    const anchorX = mapW / 2;
    const topChrome = insets.top + TOP_CHROME;
    const anchorY = Math.max(
      topChrome + (mapH - topChrome - CARD_EST) / 2,
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

    // Entering create mode always starts a fresh draft.
    useEffect(() => {
      if (!active) return;
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
      pinScale.value = 0;
      pinY.value = anchorY;
      if (user) {
        hasSeenSafetyFlag(user.id, 'first_host').then((seen) => {
          if (!seen) setFirstHostVisible(true);
        });
      }
    }, [active]);

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

    const maxPeopleNum = Math.min(50, Math.max(2, parseInt(maxPeople, 10) || 4));

    async function handleHost() {
      if (!user || !activity || !coord) return;
      Keyboard.dismiss();
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
      setTimeout(() => {
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
          // No cover photo? Fall back to the host's profile picture so the
          // event never shows up blank in the feed.
          let imageUrl: string | undefined;
          if (photoUri) imageUrl = await uploadEventPhoto(user.id, photoUri);
          else imageUrl = user.photo_url ?? undefined;
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
        queryClient.invalidateQueries({ queryKey: ['events'] });
        queryClient.invalidateQueries({ queryKey: ['exploreFeed'] });
        queryClient.invalidateQueries({ queryKey: ['myEvents'] });
        queryClient.invalidateQueries({ queryKey: ['joinedEvents'] });
        setSubmitState('success');
        setTimeout(() => {
          router.push(`/events/created/${eventId}`);
          onExit();
        }, 1300);
      } catch (e: any) {
        Alert.alert('Could not host event', e.message);
        // Fall back into the form with the pin back at its editing anchor.
        pinY.value = withTiming(anchorY, { duration: 400 });
        setPhase('form');
      }
    }

    if (!active || mapW === 0 || mapH === 0) return null;

    const emoji = activity ? ACTIVITY_MAP[activity].emoji : null;
    const visibleActivities =
      sectionFilter === 'all'
        ? ACTIVITIES
        : ACTIVITIES.filter((a) => a.section === sectionFilter);
    const nextDisabled =
      (step === 0 && !activity) || (step === 1 && !title.trim());
    const endDate = new Date(startDate.getTime() + durationH * 60 * 60 * 1000);
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
              <Icon name="pin" size={15} color={COLORS.primary} />
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
              <Icon name="location" size={13} color="#fff" />
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
                        <Icon name="check" size={26} color="#fff" strokeWidth={3} />
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
              <View style={styles.card}>
                {/* Dark heading sheet, one row: back on the left, the step
                    title centred, a ring that fills step-by-step on the right.
                    Set off from the content the way the home header is. */}
                <View style={styles.headerSheet}>
                  <View style={styles.cardHeader}>
                    {/* First step has nothing to go back to, so the slot holds
                        the close affordance instead — the search bar no longer
                        carries one. Later steps swap it for Back. */}
                    <View style={styles.backSlot}>
                      <PressableScale
                        scaleTo={0.88}
                        style={styles.backBtn}
                        onPress={step > 0 ? back : onExit}
                        accessibilityRole="button"
                        accessibilityLabel={
                          step > 0 ? 'Previous step' : 'Cancel event creation'
                        }
                      >
                        <Icon
                          name={step > 0 ? 'back' : 'close'}
                          size={17}
                          color="#fff"
                        />
                      </PressableScale>
                    </View>
                    <Text style={styles.stepTitle} numberOfLines={1}>
                      {STEP_HEADS[step]}
                    </Text>
                    <View style={styles.ringSlot}>
                      <StepRing step={step} />
                    </View>
                  </View>
                </View>

                <View style={styles.cardBody}>
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
                                  scaleTo={0.94}
                                  style={[
                                    styles.sectionPill,
                                    sel && styles.sectionPillActive,
                                  ]}
                                  onPress={() => setSectionFilter(s.id)}
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
                              const cat = categoryStyle(a.id);
                              return (
                                <PressableScale
                                  key={a.id}
                                  scaleTo={0.9}
                                  style={styles.typeItem}
                                  onPress={() => setActivity(a.id)}
                                >
                                  <View
                                    style={[
                                      styles.typeTile,
                                      sel && {
                                        backgroundColor: cat.tint,
                                        borderColor: cat.accent,
                                        borderWidth: 1.5,
                                      },
                                    ]}
                                  >
                                    <Text style={styles.typeEmoji}>{a.emoji}</Text>
                                  </View>
                                  <Text
                                    style={[
                                      styles.typeLabel,
                                      sel && {
                                        color: cat.accent,
                                        fontFamily: FONTS.bold,
                                      },
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
                          placeholderTextColor="rgba(15,24,44,0.40)"
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
                          placeholderTextColor="rgba(15,24,44,0.40)"
                          value={description}
                          onChangeText={setDescription}
                          multiline
                          maxLength={DESCRIPTION_MAX}
                        />
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
                        {/* One Date, two windows onto it: date and time each
                            open their own slimmed-down picker. */}
                        <View style={styles.startRow}>
                          <View style={{ flex: 1.4 }}>
                            <DateTimeField
                              mode="date"
                              compact
                              value={startDate}
                              onChange={setStartDate}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <DateTimeField
                              mode="time"
                              compact
                              value={startDate}
                              onChange={setStartDate}
                            />
                          </View>
                        </View>
                        <Text style={styles.label}>LASTS FOR</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={styles.durScroll}
                          contentContainerStyle={styles.durScrollContent}
                        >
                          {DURATIONS.map((h) => (
                            <PressableScale
                              key={h}
                              scaleTo={0.92}
                              style={[
                                styles.durChip,
                                durationH === h && styles.durChipActive,
                              ]}
                              onPress={() => setDurationH(h)}
                            >
                              <Text
                                style={[
                                  styles.durChipText,
                                  durationH === h && styles.durChipTextActive,
                                ]}
                              >
                                {h}h
                              </Text>
                            </PressableScale>
                          ))}
                        </ScrollView>
                        <Text style={styles.durSummary}>
                          {fmtDayShort(startDate)} · {fmtTime(startDate)} →{' '}
                          {fmtTime(endDate)}
                        </Text>
                        <Text style={styles.label}>MAX PEOPLE</Text>
                        <View style={styles.stepperRow}>
                          <PressableScale
                            scaleTo={0.88}
                            style={[
                              styles.stepperBtn,
                              maxPeopleNum <= 2 && styles.stepperBtnOff,
                            ]}
                            onPress={() =>
                              setMaxPeople(String(Math.max(2, maxPeopleNum - 1)))
                            }
                          >
                            <Text style={styles.stepperGlyph}>−</Text>
                          </PressableScale>
                          <TextInput
                            style={styles.stepperValue}
                            value={maxPeople}
                            onChangeText={(t) =>
                              setMaxPeople(t.replace(/[^0-9]/g, '').slice(0, 2))
                            }
                            onBlur={() => setMaxPeople(String(maxPeopleNum))}
                            keyboardType="number-pad"
                            returnKeyType="done"
                            selectTextOnFocus
                          />
                          <PressableScale
                            scaleTo={0.88}
                            style={[
                              styles.stepperBtn,
                              maxPeopleNum >= 50 && styles.stepperBtnOff,
                            ]}
                            onPress={() =>
                              setMaxPeople(String(Math.min(50, maxPeopleNum + 1)))
                            }
                          >
                            <Text style={styles.stepperGlyph}>+</Text>
                          </PressableScale>
                          <Text style={styles.stepperHint}>people incl. you</Text>
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
                              scaleTo={0.88}
                              style={styles.photoRemove}
                              onPress={() => setPhotoUri(null)}
                              accessibilityLabel="Remove photo"
                            >
                              <Icon name="close" size={14} color="#fff" strokeWidth={2.5} />
                            </PressableScale>
                          </View>
                        ) : (
                          <PressableScale
                            scaleTo={0.97}
                            style={styles.photoEmpty}
                            onPress={pickPhoto}
                            accessibilityRole="button"
                            accessibilityLabel="Add a cover photo"
                          >
                            <View style={styles.photoEmptyIcon}>
                              <Icon name="camera" size={22} color={COLORS.primary} />
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
                          <View style={{ flex: 1, paddingRight: 12 }}>
                            <Text style={styles.safetyLabel}>Public event</Text>
                            <Text style={styles.safetySub}>
                              {isPublic
                                ? 'Visible to everyone on the map'
                                : 'Only friends can see'}
                            </Text>
                          </View>
                          <Switch
                            value={isPublic}
                            onValueChange={setIsPublic}
                            trackColor={{ true: COLORS.primary, false: COLORS.disabled }}
                            thumbColor={COLORS.surface}
                          />
                        </View>
                        <View style={styles.safetyRow}>
                          <View style={{ flex: 1, paddingRight: 12 }}>
                            <Text style={styles.safetyLabel}>Approve who joins</Text>
                            <Text style={styles.safetySub}>
                              {requiresApproval
                                ? 'You approve each person'
                                : 'Anyone can join instantly'}
                            </Text>
                          </View>
                          <Switch
                            value={requiresApproval}
                            onValueChange={setRequiresApproval}
                            trackColor={{ true: COLORS.primary, false: COLORS.disabled }}
                            thumbColor={COLORS.surface}
                          />
                        </View>
                        {/* Female-only hosting is offered to female profiles only. */}
                        {user?.gender === 'female' && (
                          <View style={styles.safetyRow}>
                            <View style={{ flex: 1, paddingRight: 12 }}>
                              <Text style={styles.safetyLabel}>Female-only event</Text>
                              <Text style={styles.safetySub}>
                                {womenOnly
                                  ? 'Only women can see and join'
                                  : 'Anyone can see and join'}
                              </Text>
                            </View>
                            <Switch
                              value={womenOnly}
                              onValueChange={(on) =>
                                on ? setWomenOnlyConfirmVisible(true) : setWomenOnly(false)
                              }
                              trackColor={{ true: COLORS.primary, false: COLORS.disabled }}
                              thumbColor={COLORS.surface}
                            />
                          </View>
                        )}
                      </Animated.View>
                    )}
                  </View>

                  <Button
                    label={step === STEP_COUNT - 1 ? 'Host event' : 'Next'}
                    onPress={step === STEP_COUNT - 1 ? handleHost : next}
                    disabled={nextDisabled}
                  />
                </View>
              </View>
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
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 100,
    paddingHorizontal: 16,
    height: 40,
    shadowColor: '#0F182C',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  promptText: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
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
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#0F182C',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  pinEmoji: { fontSize: 27, lineHeight: 34 },
  ring: {
    position: 'absolute',
    width: PIN_SIZE + 6,
    height: PIN_SIZE + 6,
    borderRadius: (PIN_SIZE + 6) / 2,
    borderWidth: 3,
    borderColor: 'rgba(255,94,91,0.18)',
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
  card: {
    backgroundColor: COLORS.surface,
    paddingBottom: 30,
    shadowColor: '#0F182C',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  // Matches the home screen's greeting header: dark block with the white
  // content sitting underneath it. Fully square — no corner rounding on any
  // edge; the header, card and sheet all meet the screen edges flat.
  headerSheet: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  cardBody: { paddingHorizontal: 20, paddingTop: 8 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  backSlot: { width: 34, height: 34, justifyContent: 'center' },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Same width as backSlot so the title stays optically centred between them.
  ringSlot: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    gap: 6,
    maxWidth: '86%',
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 100,
    backgroundColor: COLORS.accent,
    shadowColor: '#0F182C',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  locationText: {
    flexShrink: 1,
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: '#fff',
  },
  stepArea: { height: 268, marginBottom: 12 },
  step: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  stepTitle: {
    flex: 1,
    fontFamily: FONTS.heavy,
    fontSize: 19,
    color: '#fff',
    textAlign: 'center',
  },
  sectionPillRow: { flexGrow: 0, marginTop: 12, marginHorizontal: -20 },
  sectionPillContent: { paddingHorizontal: 20, gap: 8 },
  sectionPill: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 100,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.08)',
  },
  sectionPillActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  sectionPillText: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: COLORS.textSecondary,
  },
  sectionPillTextActive: { fontFamily: FONTS.bold, color: '#fff' },
  typeScroll: { flex: 1, marginTop: 12, marginHorizontal: -4 },
  typeScrollContent: { paddingHorizontal: 4, paddingBottom: 8 },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  typeItem: { width: '23%', alignItems: 'center', gap: 6 },
  // Bare emoji, no plate. Only the selected type gets a tinted container.
  typeTile: {
    width: 58,
    height: 58,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeEmoji: { fontSize: 28, lineHeight: 34 },
  typeLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    color: 'rgba(15,24,44,0.55)',
  },
  input: {
    height: 50,
    backgroundColor: COLORS.background,
    borderRadius: 14,
    paddingHorizontal: 15,
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: COLORS.textPrimary,
    marginTop: 16,
  },
  multiline: {
    height: undefined,
    minHeight: 88,
    paddingVertical: 12,
    textAlignVertical: 'top',
    fontFamily: FONTS.medium,
    fontSize: 14,
    marginTop: 12,
  },
  charCount: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: 'rgba(15,24,44,0.35)',
    textAlign: 'right',
    marginTop: 6,
  },
  label: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    letterSpacing: 0.3,
    color: 'rgba(15,24,44,0.5)',
    marginTop: 14,
    marginBottom: 6,
  },
  startRow: { flexDirection: 'row', gap: 10 },
  durScroll: { flexGrow: 0, marginHorizontal: -20 },
  durScrollContent: { paddingHorizontal: 20, gap: 8 },
  durChip: {
    height: 36,
    paddingHorizontal: 15,
    borderRadius: 100,
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durChipActive: {
    backgroundColor: COLORS.primaryTint,
    borderColor: COLORS.primary,
  },
  durChipText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  durChipTextActive: { color: COLORS.primary },
  durSummary: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    color: COLORS.textMuted,
    marginTop: 8,
  },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnOff: { opacity: 0.4 },
  stepperGlyph: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.textPrimary,
    lineHeight: 24,
  },
  stepperValue: {
    minWidth: 46,
    textAlign: 'center',
    fontFamily: FONTS.heavy,
    fontSize: 21,
    color: COLORS.textPrimary,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  stepperHint: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  photoWrap: { marginTop: 16, borderRadius: 16, overflow: 'hidden' },
  photoPreview: { width: '100%', height: 180 },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15,24,44,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmpty: {
    alignItems: 'center',
    gap: 4,
    marginTop: 16,
    paddingVertical: 30,
    paddingHorizontal: 28,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.06)',
  },
  photoEmptyIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  photoEmptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: COLORS.textPrimary,
  },
  photoEmptySub: {
    fontFamily: FONTS.medium,
    fontSize: 12,
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
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 36,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: COLORS.background,
  },
  photoFallbackText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textSecondary,
  },
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  safetyLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  safetySub: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
