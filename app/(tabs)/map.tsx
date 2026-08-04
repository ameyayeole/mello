import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';

import { useNearbyEvents } from '@/hooks/useNearbyEvents';
import { useFriends } from '@/hooks/useFriends';
import { useLocation } from '@/hooks/useLocation';
import { useLocationStore } from '@/stores/locationStore';
import { useUIStore } from '@/stores/uiStore';
import PlaceSearch, { PlaceResult } from '@/components/PlaceSearch';
import CreateEventFab from '@/components/CreateEventFab';
import { EventDeck } from '@/components/events/EventDeck';
import HotEventsSheet from '@/components/map/HotEventsSheet';
import CreateEventFlow, {
  CreateEventFlowRef,
} from '@/components/map/CreateEventFlow';
import { ACTIVITY_MAP } from '@/constants/activities';
import { FALLBACK_MAP_CENTER } from '@/utils/eventDraft';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { NearbyEvent } from '@/types/models';
import { BOOST_ACCENT, BOOST_EMOJI, isBoosted } from '@/utils/boost';
import {
  Avatar,
  Icon,
  PressableScale,
  useTabBarInset,
} from '@/components/ui';
import { clusterPoints, Cluster } from '@/utils/clusterEvents';
import { applyMapFilters, countActiveMapFilters } from '@/utils/mapFilters';

// Gentle pop for pins. Inside map markers the native layer's transform anchor
// ends up at the top-left, so a bare scale grows diagonally; the translate
// terms re-pin the view's centre on every frame, forcing a symmetric
// inside-out pop from the map point itself.
// Google Maps on Android, Apple Maps on iOS (avoids the iOS Google Maps SDK podspec).
const MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

const PIN_SIZE = 60;
// The pin's actual painted bubble (styles.pinBubble) — smaller than PIN_SIZE,
// which is the touch target / pop-animation wrap around it. The dealt card's
// origin should be the visible glyph a user tapped, not its invisible hit
// area, or the card would appear to fly from a rect bigger than the pin.
const PIN_BUBBLE_SIZE = 52;

function PopPin({ pop, children }: { pop: boolean; children: React.ReactNode }) {
  const scale = useSharedValue(pop ? 0.4 : 1);
  useEffect(() => {
    if (pop) {
      scale.value = withSpring(1, { damping: 16, stiffness: 180, mass: 0.9 });
    }
  }, []);
  const style = useAnimatedStyle(() => {
    const s = scale.value;
    const recenter = (PIN_SIZE / 2) * (1 - s);
    return {
      transform: [
        { translateX: recenter },
        { translateY: recenter },
        { scale: s },
      ],
    };
  });
  return (
    <Animated.View style={[styles.pinPop, style]}>{children}</Animated.View>
  );
}

// Half the visible map diagonal in metres, so every pin on screen is fetched.
function regionRadiusM(region: Region): number {
  const latM = region.latitudeDelta * 111_320;
  const lngM =
    region.longitudeDelta *
    111_320 *
    Math.cos((region.latitude * Math.PI) / 180);
  const radius = (Math.max(latM, lngM) / 2) * 1.2;
  return Math.min(Math.max(radius, 1000), 100_000);
}

export default function MapScreen() {
  const router = useRouter();
  const coords = useLocationStore((s) => s.coords);
  // One selector per field. `useUIStore()` with no selector subscribes to the
  // whole store, so this screen re-rendered on any UI state change anywhere in
  // the app — a chat sheet opening, a filter changing on another tab. Measured
  // at 5 MapScreen renders for a single map pan.
  const mapFilters = useUIStore((s) => s.mapFilters);
  const creatingEvent = useUIStore((s) => s.creatingEvent);
  const setCreatingEvent = useUIStore((s) => s.setCreatingEvent);
  const dealCard = useUIStore((s) => s.dealCard);
  const { requestAndStart } = useLocation();
  const { friends } = useFriends();
  const mapRef = useRef<MapView>(null);
  const tabBarInset = useTabBarInset();
  const didCenter = useRef(false);
  // Where the map is looking; pins load for this region, not the GPS position.
  const [region, setRegion] = useState<Region | null>(null);
  const { data: rawEvents = [] } = useNearbyEvents(
    region
      ? {
          lat: region.latitude,
          lng: region.longitude,
          radiusM: regionRadiusM(region),
        }
      : null,
    // The markers are already skipped while creating (see the render below), so
    // panning to place a pin was fetching events nobody could see — and the 60s
    // poll kept re-rendering this screen underneath the wizard.
    { paused: creatingEvent }
  );

  const friendIds = useMemo(
    () => new Set(friends.map((f) => f.friend?.id).filter(Boolean) as string[]),
    [friends]
  );
  const events = useMemo(
    () => applyMapFilters(rawEvents, mapFilters, { coords, friendIds }),
    [rawEvents, mapFilters, coords, friendIds]
  );
  const filterCount = countActiveMapFilters(mapFilters);

  // Currently-boosted events in view, for the "🔥 Hot events" button + sheet.
  const [hotOpen, setHotOpen] = useState(false);
  const boostedEvents = useMemo(() => events.filter(isBoosted), [events]);

  // ── In-map event creation ──────────────────────────────────────────────────
  // While creatingEvent is on, the rest of the map UI steps aside: the filter
  // button collapses away and is replaced in the same slot by a close button,
  // chips/FABs/pins fade out, and CreateEventFlow owns the interaction. The
  // close routes back into the flow rather than flipping creatingEvent itself,
  // so leaving always goes through the flow's unsaved-draft prompt.
  const flowRef = useRef<CreateEventFlowRef>(null);
  // Stable identity, or the memo on CreateEventFlow is a no-op: a fresh arrow
  // every render is a changed prop every render.
  const exitCreate = useCallback(
    () => setCreatingEvent(false),
    [setCreatingEvent]
  );
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  // The map container's own position in window coordinates. `pointForCoordinate`
  // returns a point relative to the MapView itself, so a pin's window-space
  // origin needs this added in. Measured on layout rather than per-tap: the
  // container doesn't move once the screen has settled, and re-measuring on
  // every pin tap would be a native round trip the pin doesn't need.
  const containerRef = useRef<View>(null);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  // 0 = browse chrome, 1 = create chrome (X in, filter out).
  const createProg = useSharedValue(0);
  useEffect(() => {
    // A spring, not a curve: the controls should carry weight and overrun
    // slightly before settling. A timing curve arrives dead-on and reads as
    // inert no matter how it is eased.
    //
    // Damped to the tab bar's GLIDE rather than the looser spring this shipped
    // with. At damping 13 the overrun was large enough to read as a wobble; the
    // bar's own travel spring is the app's reference for "carries weight but
    // arrives". Still overshoots, which is why the widths below are floored at
    // zero — just not enough to notice as a bounce.
    createProg.value = withSpring(creatingEvent ? 1 : 0, {
      damping: 19,
      stiffness: 190,
      mass: 0.85,
    });
  }, [creatingEvent]);

  // The two controls trade places across the search field: the filter is pushed
  // out to the right as the close arrives from the left, and the field itself —
  // which is just flex: 1 between them — slides and stretches to follow.
  //
  // The fades are staggered rather than a straight crossfade. Overlapping them
  // leaves both controls sitting at half opacity through the middle of the
  // move, which reads as a smear; handing over at the midpoint keeps exactly
  // one of them legible at any moment.
  // Widths and margins are floored at zero but deliberately NOT capped at their
  // target. The spring overruns 1, so the arriving control swells a few pixels
  // past its resting size and the search field — flex: 1 between the two — gets
  // shoved a little too far and rebounds with it. That rebound is the momentum;
  // capping the top of the range would animate it straight back out. A negative
  // width, on the other hand, is a layout error, hence the floor.
  const filterBtnStyle = useAnimatedStyle(() => ({
    width: Math.max(0, interpolate(createProg.value, [0, 1], [44, 0])),
    marginLeft: Math.max(0, interpolate(createProg.value, [0, 1], [10, 0])),
    opacity: interpolate(
      createProg.value,
      [0, 0.45],
      [1, 0],
      Extrapolation.CLAMP
    ),
    transform: [
      { scale: interpolate(createProg.value, [0, 1], [1, 0.6]) },
      { translateX: interpolate(createProg.value, [0, 1], [0, 18]) },
    ],
  }));
  const closeBtnStyle = useAnimatedStyle(() => ({
    width: Math.max(0, interpolate(createProg.value, [0, 1], [0, 44])),
    marginRight: Math.max(0, interpolate(createProg.value, [0, 1], [0, 10])),
    opacity: interpolate(
      createProg.value,
      [0.55, 1],
      [0, 1],
      Extrapolation.CLAMP
    ),
    transform: [
      { scale: interpolate(createProg.value, [0, 1], [0.6, 1]) },
      { translateX: interpolate(createProg.value, [0, 1], [-18, 0]) },
    ],
  }));

  // Pins only pop on the first batch of events and briefly after a cluster is
  // tapped — not on every pan/zoom that mounts new markers.
  const didInitialPop = useRef(false);
  const popUntil = useRef(0);
  const initialPop = !didInitialPop.current && events.length > 0;
  if (initialPop) didInitialPop.current = true;
  const shouldPop = initialPop || Date.now() < popUntil.current;

  // Below this zoom the map is a few hundred metres wide; show every pin so
  // events at the same venue stay individually tappable.
  const CLUSTER_MIN_DELTA = 0.004;
  const clusters = useMemo(() => {
    const delta = region?.longitudeDelta ?? 0.05;
    if (delta < CLUSTER_MIN_DELTA) {
      return events.map((e) => ({ lat: e.lat, lng: e.lng, items: [e] }));
    }
    return clusterPoints(events, delta);
  }, [events, region]);

  function zoomToCluster(cluster: Cluster<(typeof events)[number]>) {
    // Arm the pop for the pins that appear when this cluster breaks apart
    // (zoom animates ~500ms, then the region settles and pins mount).
    popUntil.current = Date.now() + 1400;
    const lats = cluster.items.map((e) => e.lat);
    const lngs = cluster.items.map((e) => e.lng);
    mapRef.current?.animateToRegion(
      {
        latitude: cluster.lat,
        longitude: cluster.lng,
        // Pad the cluster bounds; floor below CLUSTER_MIN_DELTA so co-located
        // events fall apart into individual pins on the final tap.
        latitudeDelta: Math.max(
          (Math.max(...lats) - Math.min(...lats)) * 2.5,
          0.003
        ),
        longitudeDelta: Math.max(
          (Math.max(...lngs) - Math.min(...lngs)) * 2.5,
          0.003
        ),
      },
      500
    );
  }

  function goToPlace(r: PlaceResult) {
    // Always zoom tight onto the searched coordinate (street level) rather than
    // framing the place's whole boundary. A fixed small delta keeps the zoom
    // consistent whether or not the result carries a bounding box.
    mapRef.current?.animateToRegion(
      {
        latitude: r.lat,
        longitude: r.lng,
        latitudeDelta: 0.003,
        longitudeDelta: 0.003,
      },
      600
    );
  }

  // Ensure location is requested even if onboarding permissions were skipped
  // (e.g. when signing in with Google).
  useEffect(() => {
    if (!coords) requestAndStart();
  }, []);

  // Recenter the map on the user the first time we get a real fix.
  useEffect(() => {
    if (coords && !didCenter.current) {
      didCenter.current = true;
      mapRef.current?.animateToRegion(
        {
          latitude: coords.lat,
          longitude: coords.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        800
      );
    }
  }, [coords]);

  const initialRegion = coords
    ? {
        latitude: coords.lat,
        longitude: coords.lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : {
        latitude: FALLBACK_MAP_CENTER.lat,
        longitude: FALLBACK_MAP_CENTER.lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  return (
    <View
      ref={containerRef}
      style={styles.container}
      onLayout={(e) => {
        setMapSize({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        });
        containerRef.current?.measureInWindow((x, y) => setMapOffset({ x, y }));
      }}
    >
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={MAP_PROVIDER}
        initialRegion={initialRegion}
        onMapReady={() => setRegion((r) => r ?? initialRegion)}
        onRegionChangeComplete={(r) => {
          setRegion(r);
          if (creatingEvent) flowRef.current?.handleRegionSettled(r);
        }}
        onPress={(e) => {
          if (creatingEvent)
            flowRef.current?.handleMapPress(e.nativeEvent.coordinate);
        }}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {!creatingEvent &&
        clusters.map((cluster) => {
          if (cluster.items.length === 1) {
            const event = cluster.items[0];
            const boosted = isBoosted(event);
            return (
              <Marker
                key={event.id}
                coordinate={{
                  latitude: event.lat,
                  longitude: event.lng,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                // Boosted pins draw above the rest of the field.
                zIndex={boosted ? 10 : 1}
                onPress={async () => {
                  // A Marker's children are not reliably measurable with
                  // measureInWindow — react-native-maps gives the correct
                  // answer directly instead.
                  const p = await mapRef.current?.pointForCoordinate({
                    latitude: event.lat,
                    longitude: event.lng,
                  });
                  // One event — the one whose pin was tapped. This used to
                  // build a deck of every event currently rendered as a pin,
                  // by flat-mapping every cluster on the map, on every single
                  // tap. Nothing past the first entry was ever read: the card
                  // deals one event and closes on a swipe, and the many-deep
                  // stack is the fan's `EventDeck`, not this.
                  dealCard(
                    event.id,
                    p
                      ? {
                          x: p.x + mapOffset.x - PIN_BUBBLE_SIZE / 2,
                          y: p.y + mapOffset.y - PIN_BUBBLE_SIZE / 2,
                          width: PIN_BUBBLE_SIZE,
                          height: PIN_BUBBLE_SIZE,
                        }
                      : null
                  );
                }}
              >
                {/* Outer wrap stays static so the marker anchor never moves;
                    only the inner content scales in. */}
                <View style={styles.pinWrap}>
                  <PopPin pop={shouldPop}>
                    <View
                      style={[
                        styles.pinBubble,
                        boosted && styles.pinBubbleBoosted,
                      ]}
                    >
                      <Text style={styles.pinEmoji}>
                        {ACTIVITY_MAP[event.activity]?.emoji ?? '📍'}
                      </Text>
                    </View>
                    {boosted ? (
                      <View style={styles.pinFlame}>
                        <Text style={styles.pinFlameText}>{BOOST_EMOJI}</Text>
                      </View>
                    ) : (
                      <View style={styles.pinAvatar}>
                        <Avatar
                          name={event.host_name}
                          photoUrl={event.host_photo_url}
                          size={22}
                        />
                      </View>
                    )}
                  </PopPin>
                </View>
              </Marker>
            );
          }
          return (
            <Marker
              key={`cluster-${cluster.items[0].id}`}
              coordinate={{ latitude: cluster.lat, longitude: cluster.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => zoomToCluster(cluster)}
            >
              <View style={styles.pinWrap}>
                <PopPin pop={shouldPop}>
                  <View style={styles.clusterBubble}>
                    <Text style={styles.clusterCount}>
                      {cluster.items.length}
                    </Text>
                  </View>
                </PopPin>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* In-map event creation overlay (pin + wizard card) */}
      <CreateEventFlow
        ref={flowRef}
        active={creatingEvent}
        mapRef={mapRef}
        mapW={mapSize.w}
        mapH={mapSize.h}
        onExit={exitCreate}
      />

      {/* Search + activity filter chips */}
      <SafeAreaView style={styles.filterOverlay} pointerEvents="box-none">
        <Animated.View
          entering={FadeInDown.duration(400)}
          style={styles.searchRow}
        >
          {/* Leading slot: empty in browse mode, the create-mode close once the
              wizard is open. The card's own header only offers Back past the
              first step, so without this the only way out of a five-step wizard
              was to walk back through every one of them.

              Goes through the flow's own exit rather than setCreatingEvent, so
              it asks about an unsaved draft exactly as the card's X does —
              otherwise this would be the one route that silently binned work. */}
          <Animated.View
            style={[styles.morphSlot, closeBtnStyle]}
            pointerEvents={creatingEvent ? 'auto' : 'none'}
          >
            <PressableScale
              scaleTo={0.9}
              style={styles.roundBtn}
              onPress={() => flowRef.current?.requestExit()}
              accessibilityRole="button"
              accessibilityLabel="Cancel event creation"
            >
              <Icon name="close" size={19} color={COLORS.textPrimary} />
            </PressableScale>
          </Animated.View>
          <PlaceSearch
            onResult={(r) => {
              if (creatingEvent) flowRef.current?.handlePlace(r);
              else goToPlace(r);
            }}
            placeholder={creatingEvent ? 'Search for a spot' : 'Search this area'}
            bias={coords}
            style={styles.searchInput}
          />
          <Animated.View
            style={[styles.morphSlot, filterBtnStyle]}
            pointerEvents={creatingEvent ? 'none' : 'auto'}
          >
            <PressableScale
              scaleTo={0.9}
              style={styles.roundBtn}
              onPress={() => router.push('/map-filters')}
              accessibilityRole="button"
              accessibilityLabel="Open filters"
            >
              <Icon name="filter" size={19} color={COLORS.textPrimary} />
              {filterCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{filterCount}</Text>
                </View>
              )}
            </PressableScale>
          </Animated.View>
        </Animated.View>
        {/* "🔥 N hot" — live-content pill; only exists while boosted events
            are actually in view, and steps aside during event creation. */}
        {!creatingEvent && boostedEvents.length > 0 && (
          <Animated.View
            entering={FadeInDown.delay(60).duration(400)}
            exiting={FadeOut.duration(200)}
            style={styles.hotPillRow}
          >
            <PressableScale
              scaleTo={0.93}
              style={styles.hotPill}
              onPress={() => setHotOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${boostedEvents.length} hot events`}
            >
              <Text style={styles.hotPillText}>
                {BOOST_EMOJI} {boostedEvents.length} hot
              </Text>
            </PressableScale>
          </Animated.View>
        )}
      </SafeAreaView>

      {/* Browse-mode chrome: FABs + teaser step aside while creating */}
      {!creatingEvent && (
      <Animated.View
        entering={FadeIn.duration(250)}
        exiting={FadeOut.duration(200)}
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
      >
      {/* Recenter on the user's location */}
      <PressableScale
        style={[styles.locateFab, { bottom: tabBarInset + 80 }]}
        scaleTo={0.88}
        onPress={() => {
          if (coords) {
            mapRef.current?.animateToRegion(
              {
                latitude: coords.lat,
                longitude: coords.lng,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              },
              600
            );
          } else {
            requestAndStart();
          }
        }}
        accessibilityLabel="Go to my location"
        accessibilityRole="button"
      >
        <Icon name="crosshair" size={22} color="#5F6368" strokeWidth={2} />
      </PressableScale>

      {/* The event deck — the parked fan AND the open deck, one component that
          never unmounts between them.

          It lives here, inside the tabs tree, rather than at the root: that is
          what puts it BELOW the floating tab bar, so its parked fan tucks its
          lower edge behind the bar exactly as the old teaser's did. Mounted at
          the root it was above the bar instead, with nothing left to hide
          under.

          Expanding still fills the screen, because the bar steps aside for it
          — `uiStore.deckExpanded`, read by (tabs)/_layout the same way it
          reads `creatingEvent`. */}
      <EventDeck />

      <CreateEventFab onPress={() => setCreatingEvent(true)} />
      </Animated.View>
      )}

      <HotEventsSheet
        visible={hotOpen}
        events={boostedEvents}
        onClose={() => setHotOpen(false)}
        onSelect={(event: NearbyEvent) => {
          setHotOpen(false);
          mapRef.current?.animateToRegion(
            {
              latitude: event.lat,
              longitude: event.lng,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            },
            500
          );
          // No stable origin to fly from: the sheet this row lives in is
          // closing in the same tick, and the map is mid-pan to a new region —
          // unlike the pin tap above, nothing the user just looked at is still
          // where it was. Same null-origin path a deep link takes.
          dealCard(event.id, null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  filterOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[3],
    zIndex: 30,
  },
  searchInput: { flex: 1 },
  // Animated slot the X / filter buttons live in; its width collapses to zero
  // so the fixed-size button inside is clipped away as it makes room.
  morphSlot: {
    height: 44,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS['2xl'],
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F182C',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  filterBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: RADIUS.xs,
    paddingHorizontal: SPACING[1],
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.nano,
    color: '#fff',
  },
  pinWrap: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fills the wrap so the absolute-positioned avatar keeps its corner spot
  // while the whole pin scales in together.
  pinPop: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBubble: {
    width: PIN_BUBBLE_SIZE,
    height: PIN_BUBBLE_SIZE,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F182C',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  pinBubbleBoosted: {
    borderWidth: 3,
    borderColor: BOOST_ACCENT,
    shadowColor: BOOST_ACCENT,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  pinFlame: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: RADIUS.sm,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: BOOST_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinFlameText: { fontSize: TYPE_SIZE.caption, lineHeight: 15 },
  pinEmoji: { fontSize: TYPE_SIZE.h1, lineHeight: 34 },
  clusterBubble: {
    minWidth: 46,
    height: 46,
    borderRadius: RADIUS['3xl'],
    paddingHorizontal: SPACING[3],
    backgroundColor: COLORS.primary,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F182C',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  clusterCount: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.section,
    color: '#fff',
  },
  pinAvatar: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#fff',
  },
  locateFab: {
    position: 'absolute',
    right: 18,
    // `bottom` is inline: this stacks on top of CreateEventFab, which is itself
    // positioned off the floating tab bar (12 gap + 56 FAB + 12 gap).
    width: 48,
    height: 48,
    borderRadius: RADIUS['3xl'],
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F182C',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  hotPillRow: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[2.5],
    alignItems: 'flex-start',
  },
  hotPill: {
    height: 34,
    paddingHorizontal: SPACING[3.5],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: BOOST_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F182C',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  hotPillText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: BOOST_ACCENT,
  },
});
