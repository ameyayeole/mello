import { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import Animated, { FadeInDown } from 'react-native-reanimated';

// Google Maps on Android, Apple Maps on iOS (avoids the iOS Google Maps SDK podspec).
const MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;
import { useNearbyEvents } from '@/hooks/useNearbyEvents';
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
  const coords = useLocationStore((s) => s.coords);
  const { activeFilter, setFilter } = useUIStore();
  const { requestAndStart } = useLocation();
  const sheetRef = useRef<EventBottomSheetRef>(null);
  const mapRef = useRef<MapView>(null);
  const didCenter = useRef(false);
  // Where the map is looking; pins load for this region, not the GPS position.
  const [region, setRegion] = useState<Region | null>(null);
  const { data: events = [] } = useNearbyEvents(
    region
      ? {
          lat: region.latitude,
          lng: region.longitude,
          radiusM: regionRadiusM(region),
        }
      : null
  );

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
        {events.map((event) => (
          <Marker
            key={event.id}
            coordinate={{
              latitude: event.lat,
              longitude: event.lng,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => sheetRef.current?.open(event.id)}
          >
            <View style={styles.pinWrap}>
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
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Search + activity filter chips */}
      <SafeAreaView style={styles.filterOverlay} pointerEvents="box-none">
        <Animated.View
          entering={FadeInDown.duration(400)}
          style={styles.searchWrap}
        >
          <PlaceSearch
            onResult={goToPlace}
            placeholder="Search this area"
            bias={coords}
          />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(80).duration(400)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
          >
            <PressableScale
              scaleTo={0.93}
              style={[styles.filterChip, !activeFilter && styles.allChipActive]}
              onPress={() => setFilter(null)}
            >
              <Text
                style={[
                  styles.filterText,
                  !activeFilter && styles.allTextActive,
                ]}
              >
                All
              </Text>
            </PressableScale>
            {ACTIVITIES.map((a) => {
              const active = activeFilter === a.id;
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
                  onPress={() =>
                    setFilter(active ? null : (a.id as ActivityId))
                  }
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
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
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
