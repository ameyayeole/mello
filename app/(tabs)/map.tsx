import { useRef, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';

// Google Maps on Android, Apple Maps on iOS (avoids the iOS Google Maps SDK podspec).
const MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;
import { useNearbyEvents } from '@/hooks/useNearbyEvents';
import { useFriends } from '@/hooks/useFriends';
import { useLocation } from '@/hooks/useLocation';
import { useLocationStore } from '@/stores/locationStore';
import { useUIStore } from '@/stores/uiStore';
import EventBottomSheet, {
  EventBottomSheetRef,
} from '@/components/events/EventBottomSheet';
import PlaceSearch, { PlaceResult } from '@/components/PlaceSearch';
import CreateEventFab from '@/components/CreateEventFab';
import { ACTIVITIES, ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { ActivityId } from '@/types/models';
import { Avatar, Icon, IconName, PressableScale } from '@/components/ui';
import { clusterPoints, Cluster } from '@/utils/clusterEvents';
import { applyMapFilters, countActiveMapFilters } from '@/utils/mapFilters';

// Gentle pop for pins. Inside map markers the native layer's transform anchor
// ends up at the top-left, so a bare scale grows diagonally; the translate
// terms re-pin the view's centre on every frame, forcing a symmetric
// inside-out pop from the map point itself.
const PIN_SIZE = 60;

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
  const { mapFilters, setMapFilters } = useUIStore();
  const { requestAndStart } = useLocation();
  const { friends } = useFriends();
  const sheetRef = useRef<EventBottomSheetRef>(null);
  const mapRef = useRef<MapView>(null);
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
      : null
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

  // Pins only pop on the first batch of events and briefly after a cluster is
  // tapped — not on every pan/zoom that mounts new markers.
  const didInitialPop = useRef(false);
  const popUntil = useRef(0);
  const initialPop = !didInitialPop.current && events.length > 0;
  if (initialPop) didInitialPop.current = true;
  const shouldPop = initialPop || Date.now() < popUntil.current;

  function toggleActivity(id: ActivityId) {
    setMapFilters({
      ...mapFilters,
      activities: mapFilters.activities.includes(id)
        ? mapFilters.activities.filter((a) => a !== id)
        : [...mapFilters.activities, id],
    });
  }

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
    mapRef.current?.animateToRegion(
      {
        latitude: r.lat,
        longitude: r.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
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
        latitude: 19.076,
        longitude: 72.8777,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={MAP_PROVIDER}
        initialRegion={initialRegion}
        onMapReady={() => setRegion((r) => r ?? initialRegion)}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {clusters.map((cluster) => {
          if (cluster.items.length === 1) {
            const event = cluster.items[0];
            return (
              <Marker
                key={event.id}
                coordinate={{
                  latitude: event.lat,
                  longitude: event.lng,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                onPress={() => sheetRef.current?.open(event.id)}
              >
                {/* Outer wrap stays static so the marker anchor never moves;
                    only the inner content scales in. */}
                <View style={styles.pinWrap}>
                  <PopPin pop={shouldPop}>
                    <View style={styles.pinBubble}>
                      <Text style={styles.pinEmoji}>
                        {ACTIVITY_MAP[event.activity]?.emoji ?? '📍'}
                      </Text>
                    </View>
                    <View style={styles.pinAvatar}>
                      <Avatar
                        name={event.host_name}
                        photoUrl={event.host_photo_url}
                        size={22}
                      />
                    </View>
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

      {/* Search + activity filter chips */}
      <SafeAreaView style={styles.filterOverlay} pointerEvents="box-none">
        <Animated.View
          entering={FadeInDown.duration(400)}
          style={styles.searchRow}
        >
          <PlaceSearch
            onResult={goToPlace}
            placeholder="Search this area"
            bias={coords}
            style={styles.searchInput}
          />
          <PressableScale
            scaleTo={0.9}
            style={styles.filterBtn}
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
        <Animated.View entering={FadeInDown.delay(80).duration(400)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            <PressableScale
              scaleTo={0.93}
              style={[
                styles.filterChip,
                mapFilters.activities.length === 0 && styles.allChipActive,
              ]}
              onPress={() => setMapFilters({ ...mapFilters, activities: [] })}
            >
              <Text
                style={[
                  styles.filterText,
                  mapFilters.activities.length === 0 && styles.allTextActive,
                ]}
              >
                All
              </Text>
            </PressableScale>
            {ACTIVITIES.map((a) => {
              const active = mapFilters.activities.includes(a.id);
              const cat = categoryStyle(a.id);
              return (
                <PressableScale
                  key={a.id}
                  scaleTo={0.93}
                  style={[
                    styles.filterChip,
                    active && {
                      backgroundColor: cat.tint,
                      borderWidth: 1.5,
                      borderColor: cat.accent,
                    },
                  ]}
                  onPress={() => toggleActivity(a.id as ActivityId)}
                >
                  <Icon name={a.id as IconName} size={14} color={cat.accent} />
                  <Text
                    style={[styles.filterText, active && { color: cat.accent }]}
                  >
                    {a.label}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        </Animated.View>
      </SafeAreaView>

      {/* Recenter on the user's location */}
      <PressableScale
        style={styles.locateFab}
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
        <Icon name="location" size={22} color={COLORS.primary} />
      </PressableScale>

      <CreateEventFab />

      <EventBottomSheet ref={sheetRef} onDismiss={() => {}} />
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
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    zIndex: 30,
  },
  searchInput: { flex: 1 },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontFamily: FONTS.heavy,
    fontSize: 10,
    color: '#fff',
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 11,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    borderRadius: 100,
    shadowColor: '#0F182C',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  allChipActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  filterText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.textPrimary,
  },
  allTextActive: { color: '#fff' },
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
    width: 52,
    height: 52,
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
  pinEmoji: { fontSize: 27, lineHeight: 34 },
  clusterBubble: {
    minWidth: 46,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 12,
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
    fontSize: 17,
    color: '#fff',
  },
  pinAvatar: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: '#fff',
  },
  locateFab: {
    position: 'absolute',
    right: 18,
    bottom: 92,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F182C',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
});
