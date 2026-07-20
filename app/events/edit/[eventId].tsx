import { useEffect, useRef, useState } from 'react';
import { queryKeys } from '@/constants/queryKeys';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  type MapViewProps,
} from 'react-native-maps';

import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { getEventDetail, updateEvent } from '@/services/events.service';
import { uploadEventPhoto } from '@/services/storage.service';
import { FemaleOnlyConfirmModal } from '@/components/safety';
import PlaceSearch, { PlaceResult, regionForPlace } from '@/components/PlaceSearch';
import DateTimeField, {
  sameDay,
  fmtTime,
  fmtDayLong,
} from '@/components/DateTimeField';
import { ACTIVITIES } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import {
  TITLE_MAX,
  DESCRIPTION_MAX,
  clampMaxPeople,
  FALLBACK_MAP_CENTER,
} from '@/utils/eventDraft';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { ActivityId, Coords } from '@/types/models';
import {
  ActivityGlyph,
  Button,
  Icon,
  Loader,
  MelloPin,
  PressableScale,
  Screen,
  ScreenHeader,
} from '@/components/ui';
import { showError } from '@/utils/errors';

// react-native-maps declares MapPressEvent but does not export it from the
// package root, so it is derived from the prop rather than reached for down an
// internal path that a minor release could move.
type MapPressEvent = Parameters<NonNullable<MapViewProps['onPress']>>[0];

// Google Maps on Android, Apple Maps on iOS.
const MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;


// Host edits an existing event. Mirrors the create screen, prefilled from the
// event. The events table only stores a PostGIS point (no lat/lng columns are
// selectable from the client), so the map starts at the user's position and
// the location is only written back when the host actually picks a new one.
export default function EditEventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const userCoords = useLocationStore((s) => s.coords);

  const { data: event, isLoading } = useQuery({
    queryKey: queryKeys.eventDetail.of(eventId),
    queryFn: () => getEventDetail(eventId),
    enabled: !!eventId,
  });

  const [activity, setActivity] = useState<ActivityId>('coffee');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [maxPeople, setMaxPeople] = useState('');
  const [startDate, setStartDate] = useState<Date>(() => new Date());
  const [endDate, setEndDate] = useState<Date>(() => new Date());
  const [isPublic, setIsPublic] = useState(true);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [womenOnly, setWomenOnly] = useState(false);
  const [womenOnlyConfirmVisible, setWomenOnlyConfirmVisible] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  // The event's stored cover (kept unless removed) vs a newly picked local one.
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  // Only set when the host picks a new spot — untouched means "don't update".
  const [newCoords, setNewCoords] = useState<Coords | null>(null);
  const [locationName, setLocationName] = useState('');
  const [seeded, setSeeded] = useState(false);
  const miniMapRef = useRef<MapView>(null);

  const mapCenter = newCoords ?? userCoords ?? FALLBACK_MAP_CENTER;

  // Seed the form once from the fetched event.
  useEffect(() => {
    if (!event || seeded) return;
    setActivity(event.activity);
    setTitle(event.title);
    setDescription(event.description ?? '');
    setMaxPeople(event.max_people != null ? String(event.max_people) : '');
    const starts = new Date(event.starts_at);
    setStartDate(starts);
    setEndDate(
      event.ends_at
        ? new Date(event.ends_at)
        : new Date(starts.getTime() + 2 * 60 * 60 * 1000)
    );
    setIsPublic(event.is_public);
    setRequiresApproval(event.requires_approval);
    setWomenOnly(!!event.women_only);
    setExistingImageUrl(event.image_url);
    setLocationName(event.location_name ?? '');
    setSeeded(true);
  }, [event, seeded]);

  function onSearchResult(r: PlaceResult) {
    setNewCoords({ lat: r.lat, lng: r.lng });
    setLocationName(r.name);
    miniMapRef.current?.animateToRegion(regionForPlace(r), 600);
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function onMapPress(e: MapPressEvent) {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setNewCoords({ lat: latitude, lng: longitude });

    const [place] = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });
    const name =
      [place?.name, place?.street, place?.city].filter(Boolean).join(', ') ||
      'Selected location';
    setLocationName(name);
  }

  async function handleSave() {
    if (!title.trim() || !user || !event) return;
    if (endDate <= startDate) {
      Alert.alert('Invalid time', 'The end time must be after the start time.');
      return;
    }

    try {
      setLoading(true);
      // New local photo → upload it; photo removed → clear; otherwise keep.
      let imageUrl: string | null = existingImageUrl;
      if (photoUri) {
        imageUrl = await uploadEventPhoto(user.id, photoUri);
      }
      await updateEvent(event.id, {
        activity,
        title: title.trim(),
        description: description.trim() || null,
        imageUrl,
        ...(newCoords ? { lat: newCoords.lat, lng: newCoords.lng } : {}),
        locationName: locationName || null,
        startsAt: startDate,
        endsAt: endDate,
        maxPeople: maxPeople ? clampMaxPeople(maxPeople) : null,
        isPublic,
        requiresApproval,
        womenOnly,
      });
      // Refresh everywhere this event appears.
      queryClient.invalidateQueries({ queryKey: queryKeys.eventDetail.of(event.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.events.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.exploreFeed.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.myEvents.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.joinedEvents.all });
      router.back();
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  }

  if (isLoading || !event || !seeded) {
    return (
      <Screen modal>
        <Loader />
      </Screen>
    );
  }

  const currentPhoto = photoUri ?? existingImageUrl;

  return (
    <Screen modal>
      <ScreenHeader title="Edit event" backIcon="close" tone="transparent" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Category picker */}
        <Text style={styles.label}>CATEGORY</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
          style={{ flexGrow: 0, marginHorizontal: -20 }}
        >
          {ACTIVITIES.map((a) => {
            const sel = activity === a.id;
            const cat = categoryStyle(a.id);
            return (
              <PressableScale
                key={a.id}
                scaleTo={0.92}
                style={styles.categoryItem}
                onPress={() => setActivity(a.id)}
              >
                <View
                  style={[
                    styles.categoryTile,
                    sel && {
                      backgroundColor: cat.tint,
                      borderColor: cat.accent,
                      borderWidth: 1.5,
                    },
                  ]}
                >
                  <ActivityGlyph
                    activity={a.id}
                    size={24}
                    color={sel ? cat.accent : 'rgba(15,24,44,0.55)'}
                  />
                </View>
                <Text
                  style={[
                    styles.categoryLabel,
                    sel && { color: cat.accent, fontFamily: FONTS.bold },
                  ]}
                >
                  {a.label}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        {/* Title */}
        <Text style={styles.label}>EVENT TITLE</Text>
        <TextInput
          style={[styles.input, titleFocused && styles.inputFocused]}
          placeholder="e.g. Sunset rooftop drinks"
          placeholderTextColor="rgba(15,24,44,0.40)"
          value={title}
          onChangeText={setTitle}
          onFocus={() => setTitleFocused(true)}
          onBlur={() => setTitleFocused(false)}
          maxLength={TITLE_MAX}
        />
        <Text style={styles.charCount}>
          {title.length}/{TITLE_MAX}
        </Text>

        {/* Description */}
        <Text style={styles.label}>DESCRIPTION</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Tell people what this event is about…"
          placeholderTextColor="rgba(15,24,44,0.40)"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={DESCRIPTION_MAX}
        />
        <Text style={styles.charCount}>
          {description.length}/{DESCRIPTION_MAX}
        </Text>

        {/* Cover photo */}
        <Text style={styles.label}>
          COVER PHOTO <Text style={styles.labelOptional}>(optional)</Text>
        </Text>
        {currentPhoto ? (
          <View>
            <View style={styles.photoPicker}>
              <Image
                source={{ uri: currentPhoto }}
                style={styles.photoPreview}
                contentFit="cover"
              />
            </View>
            <View style={styles.photoActions}>
              <TouchableOpacity onPress={pickPhoto} hitSlop={8}>
                <Text style={styles.photoChange}>Change photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setPhotoUri(null);
                  setExistingImageUrl(null);
                }}
                hitSlop={8}
              >
                <Text style={styles.photoRemove}>Remove photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.photoPlaceholder}
            onPress={pickPhoto}
            activeOpacity={0.7}
          >
            <View style={styles.photoAddIcon}>
              <Icon name="camera" size={20} color={COLORS.primary} />
            </View>
            <Text style={styles.photoPlaceholderText}>Add a photo</Text>
          </TouchableOpacity>
        )}

        {/* When */}
        <View style={styles.whenRow}>
          <View style={styles.whenCol}>
            <Text style={styles.label}>STARTS</Text>
            <DateTimeField
              compact
              value={startDate}
              onChange={(d) => {
                setStartDate(d);
                // Keep the end after the start: bump it forward by 2h if needed.
                if (endDate <= d)
                  setEndDate(new Date(d.getTime() + 2 * 60 * 60 * 1000));
              }}
            />
          </View>
          <View style={styles.whenCol}>
            <Text style={styles.label}>ENDS</Text>
            <DateTimeField
              compact
              value={endDate}
              onChange={setEndDate}
              minDate={startDate}
            />
          </View>
        </View>
        <Text style={styles.spanSummary}>
          {fmtDayLong(startDate)} · {fmtTime(startDate)} →{' '}
          {sameDay(startDate, endDate)
            ? fmtTime(endDate)
            : `${fmtDayLong(endDate)} · ${fmtTime(endDate)}`}
        </Text>

        {/* Max people */}
        <Text style={styles.label}>MAX PARTICIPANTS</Text>
        <TextInput
          style={[styles.input, styles.shortInput]}
          placeholder="e.g. 4"
          placeholderTextColor="rgba(15,24,44,0.40)"
          value={maxPeople}
          onChangeText={setMaxPeople}
          keyboardType="numeric"
        />

        {/* Safety & visibility */}
        <View style={styles.safetyCard}>
          <View style={styles.safetyHeader}>
            <Icon name="shield" size={16} color={COLORS.success} />
            <Text style={styles.safetyTitle}>Safety</Text>
          </View>
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
                  ? 'You approve each person who wants to join'
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
                    ? 'Only women can see and join this event'
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
        </View>

        {/* Location picker map */}
        <Text style={styles.label}>LOCATION</Text>
        <PlaceSearch
          onResult={onSearchResult}
          placeholder="Search for a place"
          style={styles.locationSearch}
          bias={userCoords ?? mapCenter}
        />
        {locationName ? (
          <View style={styles.locationRow}>
            <Icon name="location" size={15} color={COLORS.primary} />
            <Text style={styles.locationName} numberOfLines={1}>
              {locationName}
            </Text>
          </View>
        ) : null}
        <Text style={styles.locationHint}>
          {newCoords
            ? 'New spot picked — save to apply it.'
            : 'Search above or tap the map to move the event.'}
        </Text>
        <View style={styles.mapWrapper}>
          <MapView
            ref={miniMapRef}
            style={styles.miniMap}
            provider={MAP_PROVIDER}
            initialRegion={{
              latitude: mapCenter.lat,
              longitude: mapCenter.lng,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            onPress={onMapPress}
          >
            {newCoords && (
              <Marker
                coordinate={{
                  latitude: newCoords.lat,
                  longitude: newCoords.lng,
                }}
                anchor={{ x: 0.5, y: 1 }}
              >
                <MelloPin height={40} />
              </Marker>
            )}
          </MapView>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          variant="primary"
          label="Save changes"
          onPress={handleSave}
          loading={loading}
          disabled={!title.trim()}
        />
      </View>

      {/* Safety popup #9: confirm switching to female-only (every time). */}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingTop: 8, gap: 7, paddingBottom: 24 },
  label: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    letterSpacing: 0.3,
    color: 'rgba(15,24,44,0.5)',
    marginTop: 10,
    marginBottom: 3,
  },
  labelOptional: {
    fontFamily: FONTS.medium,
    color: 'rgba(15,24,44,0.32)',
    letterSpacing: 0,
  },
  charCount: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: 'rgba(15,24,44,0.35)',
    textAlign: 'right',
    marginTop: 4,
  },
  categoryRow: { gap: 9, paddingHorizontal: 20 },
  categoryItem: { width: 62, alignItems: 'center', gap: 6 },
  categoryTile: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: 'rgba(15,24,44,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    color: 'rgba(15,24,44,0.55)',
  },
  input: {
    height: 48,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 15,
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputFocused: { borderWidth: 1.5, borderColor: COLORS.primary },
  multiline: {
    height: undefined,
    minHeight: 80,
    paddingVertical: 12,
    textAlignVertical: 'top',
    fontFamily: FONTS.medium,
    fontSize: 14,
  },
  shortInput: { width: 120 },
  photoPicker: {
    height: 170,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
  },
  photoPreview: { width: '100%', height: '100%' },
  photoActions: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 8,
    marginLeft: 4,
  },
  photoChange: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: COLORS.primary,
  },
  photoPlaceholder: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: 'rgba(15,24,44,0.2)',
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },
  photoAddIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholderText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: 'rgba(15,24,44,0.5)',
  },
  photoRemove: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: COLORS.error,
  },
  spanSummary: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  whenRow: { flexDirection: 'row', gap: 10 },
  whenCol: { flex: 1 },
  safetyCard: {
    backgroundColor: 'rgba(31,164,99,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(31,164,99,0.22)',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
    gap: 12,
  },
  safetyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  safetyTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 12.5,
    color: COLORS.success,
  },
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  safetyLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    color: COLORS.textPrimary,
  },
  safetySub: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  locationSearch: { marginTop: 4, marginBottom: 8 },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  locationName: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  locationHint: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  mapWrapper: { borderRadius: 16, overflow: 'hidden', height: 200 },
  miniMap: { flex: 1 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,24,44,0.08)',
    backgroundColor: COLORS.surface,
  },
});
