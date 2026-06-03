import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

// Google Maps on Android, Apple Maps on iOS.
const MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;
import * as Location from 'expo-location';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { createEvent } from '@/services/events.service';
import { ACTIVITIES } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { ActivityId } from '@/types/models';

export default function CreateEventScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const userCoords = useLocationStore((s) => s.coords);

  const [activity, setActivity] = useState<ActivityId>('coffee');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [maxPeople, setMaxPeople] = useState('4');
  const [isPublic, setIsPublic] = useState(true);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pinCoords, setPinCoords] = useState(
    userCoords ?? { lat: 19.076, lng: 72.8777 }
  );
  const [locationName, setLocationName] = useState('');

  async function onMapPress(e: any) {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setPinCoords({ lat: latitude, lng: longitude });

    const [place] = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });
    const name =
      [place?.name, place?.street, place?.city].filter(Boolean).join(', ') ||
      'Selected location';
    setLocationName(name);
  }

  async function handleCreate() {
    if (!title.trim() || !user) return;
    const startsAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now default

    try {
      setLoading(true);
      const eventId = await createEvent({
        hostId: user.id,
        activity,
        title: title.trim(),
        description: description.trim() || undefined,
        lat: pinCoords.lat,
        lng: pinCoords.lng,
        locationName: locationName || undefined,
        startsAt,
        requiresApproval,
        maxPeople: maxPeople ? parseInt(maxPeople) : undefined,
        isPublic,
      });
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Event</Text>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={loading || !title.trim()}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <Text
              style={[
                styles.createText,
                !title.trim() && styles.createTextDisabled,
              ]}
            >
              Create
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Activity picker */}
        <Text style={styles.label}>Activity</Text>
        <View style={styles.activityRow}>
          {ACTIVITIES.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[
                styles.activityChip,
                activity === a.id && styles.activityChipActive,
              ]}
              onPress={() => setActivity(a.id)}
            >
              <Text style={styles.activityEmoji}>{a.emoji}</Text>
              <Text
                style={[
                  styles.activityLabel,
                  activity === a.id && styles.activityLabelActive,
                ]}
              >
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Title */}
        <Text style={styles.label}>Event title *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Morning coffee at Starbucks"
          placeholderTextColor={COLORS.textMuted}
          value={title}
          onChangeText={setTitle}
        />

        {/* Description */}
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Tell people what this event is about..."
          placeholderTextColor={COLORS.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        {/* Max people */}
        <Text style={styles.label}>Max participants</Text>
        <TextInput
          style={[styles.input, styles.shortInput]}
          placeholder="e.g. 4"
          placeholderTextColor={COLORS.textMuted}
          value={maxPeople}
          onChangeText={setMaxPeople}
          keyboardType="numeric"
        />

        {/* Privacy */}
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Public event</Text>
            <Text style={styles.rowSubtitle}>
              {isPublic ? 'Visible to everyone on the map' : 'Only friends can see'}
            </Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ true: COLORS.primary, false: COLORS.border }}
            thumbColor={COLORS.surface}
          />
        </View>

        {/* Join policy */}
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.label}>Require approval to join</Text>
            <Text style={styles.rowSubtitle}>
              {requiresApproval
                ? 'You approve each person who wants to join'
                : 'Anyone can join instantly'}
            </Text>
          </View>
          <Switch
            value={requiresApproval}
            onValueChange={setRequiresApproval}
            trackColor={{ true: COLORS.primary, false: COLORS.border }}
            thumbColor={COLORS.surface}
          />
        </View>

        {/* Location picker map */}
        <Text style={styles.label}>Location (tap map to set)</Text>
        {locationName ? (
          <Text style={styles.locationName}>📍 {locationName}</Text>
        ) : null}
        <View style={styles.mapWrapper}>
          <MapView
            style={styles.miniMap}
            provider={MAP_PROVIDER}
            initialRegion={{
              latitude: pinCoords.lat,
              longitude: pinCoords.lng,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            onPress={onMapPress}
          >
            <Marker
              coordinate={{ latitude: pinCoords.lat, longitude: pinCoords.lng }}
            />
          </MapView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  cancelText: { fontSize: 16, color: COLORS.textSecondary },
  createText: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  createTextDisabled: { color: COLORS.textMuted },
  scroll: { padding: 20, gap: 8 },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 8,
  },
  activityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  activityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  activityChipActive: { borderColor: COLORS.primary, backgroundColor: '#FFF0EF' },
  activityEmoji: { fontSize: 14 },
  activityLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  activityLabelActive: { color: COLORS.primary },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  shortInput: { width: 120 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  rowSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  locationName: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 4 },
  mapWrapper: { borderRadius: 16, overflow: 'hidden', height: 200 },
  miniMap: { flex: 1 },
});
