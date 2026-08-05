import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, Text, StyleSheet, Keyboard } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import { clampMaxPeople, draftHasWork } from '@/utils/eventDraft';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import MapView, { Region } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
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
import { useCreateEventStore } from '@/stores/createEventStore';
import { createEvent } from '@/services/events.service';
import { uploadEventPhoto } from '@/services/storage.service';
import { hasSeenSafetyFlag, markSafetyFlagSeen } from '@/services/safety';
import { clearEventDraft } from '@/services/eventDraftStore';
import { SafetyPopup } from '@/components/safety';
import { PlaceResult } from '@/components/PlaceSearch';
import { ACTIVITY_MAP } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Avatar, Icon } from '@/components/ui';
import { errorMessage } from '@/utils/errors';
import { GLYPH_STROKE } from './create/motion';
import { CreateCard } from './create/CreateCard';
import { DiscardDialog } from './create/DiscardDialog';
import { LocationPill } from './create/LocationPill';
import { useDraftPersistence } from './create/useDraftPersistence';
import { themedStyles } from '@/theme';

// ─── In-map event creation ───────────────────────────────────────────────────
// The map itself is the canvas:
//   drop  → "tap anywhere" prompt; a tap plants the pin
//   form  → the pin is a FIXED overlay centred in the map area above the card;
//           panning the map moves the location under it (Uber-style), and the
//           wizard card below walks through type → name → when → details →
//           safety. The pin's emoji updates live as the type changes.
//   submit→ card drops away, the camera zooms slowly into the pin, which morphs
//           into the host's avatar with a spinning ring, then a green check.
// The MapView stays owned by map.tsx; it forwards taps / region settles / place
// searches here through the imperative ref.
//
// This file is the orchestrator only. The draft lives in `createEventStore`,
// the steps are in `create/steps/`, and the persistence is in
// `create/useDraftPersistence`. It used to be all of that at once, in 1,800
// lines and 26 useState hooks, which meant every field re-rendered every other
// field — measured at 12 renders of this tree for a single map pan.

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
// First-frame fallback only. The card reports its real height through onLayout
// and `anchorY` uses that from the next frame on — this is just what to assume
// for the one frame before the measurement lands.
//
// It used to be the only source of truth, which made the pin's position (and
// therefore the coordinate the event is created at) depend on a number nobody
// re-derived when the card's chrome changed.
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
// Shortest the whole submit can take, success or failure. The two beats above
// account for 1,370ms of it; the remainder is a held beat so the result does
// not arrive the instant the pin stops moving. A write that takes longer than
// this is waited for rather than cut off — the tick means the row exists.
const MIN_CEREMONY_MS = 1800;
// How long a failure holds before the form comes back. Long enough to read one
// short line without stranding someone in a state they cannot act on.
const ERROR_HOLD_MS = 2000;
// The success tick holds a little less: it is a confirmation, not something to
// read, and the screen it pushes to says the same thing at length.
const SUCCESS_HOLD_MS = 1300;

const CreateEventFlow = forwardRef<CreateEventFlowRef, Props>(
  function CreateEventFlow({ active, mapRef, mapW, mapH, onExit }, ref) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const user = useAuthStore((s) => s.user);
    const insets = useSafeAreaInsets();

    // Only what this file actually draws. Everything else the wizard holds is
    // read by the step that owns it, or through getState() in the handlers
    // below — neither of which re-renders this tree.
    const phase = useCreateEventStore((s) => s.phase);
    const activity = useCreateEventStore((s) => s.activity);
    const cardH = useCreateEventStore((s) => s.cardH);

    const [submitState, setSubmitState] = useState<
      'loading' | 'success' | 'error'
    >('loading');
    const [firstHostVisible, setFirstHostVisible] = useState(false);
    const [discardVisible, setDiscardVisible] = useState(false);

    const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const recentreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Every timer here outlives the frame that set it, and two of them navigate
    // or drive the camera. Leaving them armed through an unmount pushes a route
    // from a dead component.
    useEffect(
      () => () => {
        if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
        if (successTimer.current) clearTimeout(successTimer.current);
        if (recentreTimer.current) clearTimeout(recentreTimer.current);
        if (errorTimer.current) clearTimeout(errorTimer.current);
      },
      []
    );

    // Screen point the pin hangs at while editing: horizontally centred, and
    // vertically at the exact midpoint of the visible map — between the bottom
    // of the search row and the top of the card.
    //
    // Both ends are real measurements rather than constants, which is what makes
    // this land identically on every device: the top comes from the live
    // safe-area inset, the bottom from the card's own onLayout. The old version
    // divided by a hardcoded card height, so the pin sat differently depending
    // on how far that estimate had drifted from the card actually on screen.
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
      const { setLocationName } = useCreateEventStore.getState();
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
      const store = useCreateEventStore.getState();
      store.setCoord({ lat, lng });
      if (name) store.setLocationName(name);
      else reverseGeocode(lat, lng);
      mapRef.current?.animateToRegion(
        regionForAnchor(lat, lng, PLACE_LNG_DELTA),
        550
      );
      if (store.phase === 'drop') {
        store.setPhase('form');
        pinY.value = anchorY;
        pinScale.value = 0.4;
        pinScale.value = withTiming(1, {
          duration: 320,
          easing: Easing.out(Easing.cubic),
        });
      }
    }

    // Entering create mode starts blank; the persistence hook below then
    // restores a stored draft over the top. Blank-first matters: the restore is
    // async, so without it the form would briefly show the *previous* session's
    // fields before this one's.
    useEffect(() => {
      if (!active) return;
      useCreateEventStore.getState().reset();
      setSubmitState('loading');
      pinScale.value = 0;
      pinY.value = anchorY;
      if (!user) return;
      hasSeenSafetyFlag(user.id, 'first_host').then((seen) => {
        if (!seen) setFirstHostVisible(true);
      });
      // anchorY deliberately absent: this is entry, and re-running it because
      // the card was measured would blank a form the user is already filling in.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, user]);

    const { restored, discard } = useDraftPersistence({
      active,
      userId: user?.id,
      // Only a draft that got as far as a pin can reopen the form; without a
      // coordinate there is nothing to hang it on, so it resumes at the drop
      // prompt with the fields already filled.
      onRestoredCoord: (c) => {
        useCreateEventStore.getState().setPhase('form');
        pinScale.value = 1;
        pinY.value = anchorY;
        mapRef.current?.animateToRegion(
          regionForAnchor(c.lat, c.lng, PLACE_LNG_DELTA),
          550
        );
      },
    });

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
    }, [phase, submitState, ringDeg]);

    function dismissFirstHost() {
      setFirstHostVisible(false);
      if (user) markSafetyFlagSeen(user.id, 'first_host');
    }

    function requestExit() {
      const s = useCreateEventStore.getState();
      // The event is already on its way and the zoom is mid-flight; there is
      // nothing to cancel and no draft left to ask about.
      if (s.phase === 'submit') return;
      // Only the fields the user had to type or choose count as work worth
      // protecting. The date, duration and toggles all arrive pre-filled, so a
      // draft carrying nothing but defaults exits without a prompt.
      if (draftHasWork(s)) setDiscardVisible(true);
      else onExit();
    }

    useImperativeHandle(ref, () => ({
      handleMapPress(c) {
        // Only the first tap plants the pin; afterwards the map pans under it.
        if (useCreateEventStore.getState().phase === 'drop') {
          plantPin(c.latitude, c.longitude);
        }
      },
      handlePlace(r) {
        plantPin(r.lat, r.lng, r.name);
      },
      requestExit() {
        requestExit();
      },
      handleRegionSettled(region) {
        // Read through getState rather than a subscribed value: this handler is
        // called imperatively from the map, and a stale closure here would plant
        // the event at the wrong coordinate.
        if (useCreateEventStore.getState().phase !== 'form') return;
        // The pin is glued to the anchor point, so whatever coordinate now sits
        // under it becomes the event location.
        const latOffset = ((mapH / 2 - anchorY) / mapH) * region.latitudeDelta;
        const lat = region.latitude + latOffset;
        const lng = region.longitude;
        useCreateEventStore.getState().setCoord({ lat, lng });
        if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
        geocodeTimer.current = setTimeout(() => reverseGeocode(lat, lng), 450);
      },
    }));

    async function handleHost() {
      const s = useCreateEventStore.getState();
      if (!user || !s.activity || !s.coord) return;
      const { coord, activity: act } = s;
      Keyboard.dismiss();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      s.setPhase('submit');
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

      // The floor, for whichever way this goes. The two beats above take
      // ZOOM_MS + PIN_DROP_MS = 1,370ms and the rest is a beat of stillness, so
      // the result does not land the instant the pin stops moving.
      //
      // Applied to the failure path too, which is why it is a helper rather
      // than a promise raced against the write: `Promise.all` rejects the
      // moment the write does, so a failure at 200ms used to put its result on
      // screen while the camera was still flying.
      const startedAt = Date.now();
      const settleCeremony = async () => {
        const remaining = MIN_CEREMONY_MS - (Date.now() - startedAt);
        if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      };

      try {
        const create = (async () => {
          // No cover photo? The column stays null and the cards fall back to
          // the host's face at render — see `eventImageUri`. This used to copy
          // `user.photo_url` in here, which left `image_url` meaning either "a
          // photo of this event" or "a photo of the host" with no way to tell,
          // and the copy pointed at a dead file the moment that host changed
          // their avatar.
          const imageUrl = s.photoUri
            ? await uploadEventPhoto(user.id, s.photoUri)
            : undefined;
          return createEvent({
            hostId: user.id,
            activity: act,
            title: s.title.trim(),
            description: s.description.trim() || undefined,
            lat: coord.lat,
            lng: coord.lng,
            locationName: s.locationName || undefined,
            startsAt: s.startDate,
            endsAt: new Date(
              s.startDate.getTime() + s.durationH * 60 * 60 * 1000
            ),
            requiresApproval: s.requiresApproval,
            womenOnly: s.womenOnly,
            // Clamped, not parsed. The field is free text, and the edit screen
            // once shipped its own unclamped parseInt that could save a party
            // size the create flow rejects — this is the shared rule.
            maxPeople: clampMaxPeople(s.maxPeople),
            isPublic: s.isPublic,
            imageUrl,
          });
        })();
        // The tick means the row exists. Waiting on the write first and the
        // floor second is what makes that true: a slower database holds the
        // spinner for as long as it takes rather than going green on a promise.
        const eventId = await create;
        await settleCeremony();
        // The event exists now, so the draft has nothing left to protect.
        // Before navigation, so a slow write cannot outlive the screen.
        await clearEventDraft(user.id);
        // All four. Dropping one produces no error — just a feed that quietly
        // stops showing the event that was just created.
        queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.exploreFeed.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.myEvents.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.joinedEvents.all });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSubmitState('success');
        successTimer.current = setTimeout(() => {
          router.push(`/events/created/${eventId}`);
          onExit();
        }, SUCCESS_HOLD_MS);
      } catch (e) {
        // The user is told "try again later" and nothing more, so this is the
        // only place the actual reason survives. Swallowing it entirely would
        // make a broken host path undiagnosable — same pattern as the other
        // non-fatal failures in services/.
        console.warn('host event failed:', errorMessage(e));
        // Same ceremony as success, so a failure reads as an answer to the
        // question rather than as the animation breaking.
        await settleCeremony();
        // The recentre beat is still pending if the write outran it; letting it
        // fire would drive the camera for an event that was never created.
        if (recentreTimer.current) clearTimeout(recentreTimer.current);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setSubmitState('error');
        // Holds long enough to read, then puts the form back with everything
        // still filled in, so "try again" is one tap and not a re-entry.
        //
        // No alert. The pin is already saying it, and an Alert on top would
        // cover the thing it is explaining and need a second dismissal.
        errorTimer.current = setTimeout(() => {
          // Pull the camera back out to the span the form is composed against —
          // without this the card returns over a map still zoomed to
          // ZOOM_LNG_DELTA.
          mapRef.current?.animateToRegion(
            regionForAnchor(coord.lat, coord.lng, PLACE_LNG_DELTA),
            400
          );
          pinY.value = withTiming(anchorY, { duration: 400 });
          useCreateEventStore.getState().setPhase('form');
          // Back to the starting state, or the next attempt opens on the X.
          setSubmitState('loading');
        }, ERROR_HOLD_MS);
      }
    }

    if (!active || mapW === 0 || mapH === 0) return null;

    const emoji = activity ? ACTIVITY_MAP[activity].emoji : null;

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
              <Icon
                name="pin"
                size={15}
                color={COLORS.primary}
                strokeWidth={GLYPH_STROKE}
              />
              <Text style={styles.promptText}>Tap anywhere to drop a pin</Text>
            </View>
          </Animated.View>
        )}

        {phase === 'form' && <LocationPill top={insets.top + TOP_CHROME + 10} />}

        {/* The pin: a bare white circle fixed to the anchor point. The map moves
            underneath it, and every edit (type, submit states) plays out inside
            it. */}
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
                      <Animated.View entering={FadeIn.delay(180).duration(280)}>
                        <Icon
                          name="check"
                          size={26}
                          color={COLORS.white}
                          strokeWidth={3}
                        />
                      </Animated.View>
                    </Animated.View>
                  )}
                  {/* Failure fills the same circle the same way, in the same
                      time. The two outcomes are one answer with two values, so
                      making the bad one louder would only make it feel like a
                      malfunction rather than a result. */}
                  {submitState === 'error' && (
                    <Animated.View
                      entering={FadeIn.duration(320).easing(Easing.out(Easing.cubic))}
                      style={styles.errorFill}
                    >
                      <Animated.View entering={FadeIn.delay(180).duration(280)}>
                        <Icon
                          name="close"
                          size={26}
                          color={COLORS.white}
                          strokeWidth={3}
                        />
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

        {/* Sits under the pin, which by now has finished its drop to mapH / 2 —
            the ceremony floor guarantees that, so this can be positioned
            against the pin's resting place rather than chasing it. */}
        {phase === 'submit' && submitState === 'error' && (
          <Animated.View
            entering={FadeIn.delay(200).duration(280)}
            style={[styles.errorNoteWrap, { top: mapH / 2 + PIN_SIZE + SPACING[4] }]}
            pointerEvents="none"
          >
            <View style={styles.errorNote}>
              <Text style={styles.errorNoteText}>
                Couldn&apos;t create your event. Try again later.
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Always mounted — it gates on `phase` internally so the card can
            animate out rather than disappear. */}
        <CreateCard
          restored={restored}
          onStartFresh={discard}
          onExit={requestExit}
          onHost={handleHost}
        />

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

        <DiscardDialog
          visible={discardVisible}
          onClose={() => setDiscardVisible(false)}
          onKeep={() => {
            setDiscardVisible(false);
            onExit();
          }}
          onDiscard={() => {
            discard();
            setDiscardVisible(false);
            onExit();
          }}
        />
      </View>
    );
  }
);

// Memoised because the map re-renders for reasons the wizard does not care
// about — a region settle, an events refetch, the 60s poll. Measured at 5
// MapScreen renders per pan, each dragging this whole tree with it.
//
// `onExit` must be a stable callback at the call site for this to do anything;
// map.tsx holds it in a useCallback.
export default memo(CreateEventFlow);

const styles = themedStyles(() => ({
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
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2.5],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  promptText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textPrimary,
  },
  pinHolder: {
    position: 'absolute',
    top: 0,
    width: PIN_SIZE,
    height: PIN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.ink,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  pinEmoji: { fontSize: TYPE_SIZE.h1, lineHeight: 34 },
  ring: {
    position: 'absolute',
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 3,
    borderColor: COLORS.primary,
    borderTopColor: 'transparent',
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
  // Deliberately identical to successFill but for the colour — see the comment
  // at the render site.
  errorFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: CIRCLE / 2,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorNoteWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: SPACING[6],
  },
  // Same surface and shadow as the "tap anywhere" prompt: both are the flow
  // talking to you over the map, so they are the same object.
  errorNote: {
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2.5],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  errorNoteText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
}));
