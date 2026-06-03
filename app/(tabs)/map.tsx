import { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';

// Google Maps on Android, Apple Maps on iOS (avoids the iOS Google Maps SDK podspec).
const MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;
import { useNearbyEvents } from '@/hooks/useNearbyEvents';
import { useLocation } from '@/hooks/useLocation';
import { useLocationStore } from '@/stores/locationStore';
import { useUIStore } from '@/stores/uiStore';
import EventBottomSheet, { EventBottomSheetRef } from '@/components/events/EventBottomSheet';
import { ACTIVITIES, ACTIVITY_MAP } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { ActivityId } from '@/types/models';

export default function MapScreen() {
  const coords = useLocationStore((s) => s.coords);
  const { activeFilter, setFilter } = useUIStore();
  const { data: events = [], isLoading } = useNearbyEvents();
  const { requestAndStart } = useLocation();
  const sheetRef = useRef<EventBottomSheetRef>(null);
  const mapRef = useRef<MapView>(null);
  const didCenter = useRef(false);

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
        showsUserLocation
        showsMyLocationButton={false}
      >
        {events.map((event) => {
          const activity = ACTIVITY_MAP[event.activity];
          return (
            <Marker
              key={event.id}
              coordinate={{
                latitude: event.lat,
                longitude: event.lng,
              }}
              onPress={() => sheetRef.current?.open(event.id)}
            >
              <View style={styles.pin}>
                <Text style={styles.pinEmoji}>{activity.emoji}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Activity filter chips */}
      <SafeAreaView style={styles.filterOverlay} pointerEvents="box-none">
        <View style={styles.filters}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              !activeFilter && styles.filterChipActive,
            ]}
            onPress={() => setFilter(null)}
          >
            <Text
              style={[
                styles.filterText,
                !activeFilter && styles.filterTextActive,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>
          {ACTIVITIES.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[
                styles.filterChip,
                activeFilter === a.id && styles.filterChipActive,
              ]}
              onPress={() => setFilter(activeFilter === a.id ? null : a.id as ActivityId)}
            >
              <Text style={styles.filterEmoji}>{a.emoji}</Text>
              <Text
                style={[
                  styles.filterText,
                  activeFilter === a.id && styles.filterTextActive,
                ]}
              >
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      <EventBottomSheet
        ref={sheetRef}
        onDismiss={() => {}}
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
  filters: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
    flexWrap: 'nowrap',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterEmoji: { fontSize: 13 },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  filterTextActive: { color: '#fff' },
  pin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pinEmoji: { fontSize: 22 },
});
