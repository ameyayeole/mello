import { useEffect, useMemo, useRef, useState } from 'react';
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
  Platform,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

// Google Maps on Android, Apple Maps on iOS.
const MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { createEvent } from '@/services/events.service';
import { uploadEventPhoto } from '@/services/storage.service';
import { hasSeenSafetyFlag, markSafetyFlagSeen } from '@/services/safety';
import { SafetyPopup, FemaleOnlyConfirmModal } from '@/components/safety';
import PlaceSearch, { PlaceResult } from '@/components/PlaceSearch';
import { ACTIVITIES } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { ActivityId } from '@/types/models';
import {
  Button,
  Icon,
  IconButton,
  IconName,
  MelloPin,
  PressableScale,
} from '@/components/ui';

// ─── Pure-JS date/time span picker ──────────────────────────────────────────
// No native datetime module (not in the build), so we render a custom calendar
// month grid + a time list inside a modal. Formatting is done manually to avoid
// relying on Intl in Hermes.
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const TIME_CHIP_W = 86;
const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => i * 30); // minutes of day

function roundUpTo30(d: Date) {
  const r = new Date(d);
  r.setSeconds(0, 0);
  const m = r.getMinutes();
  if (m % 30 !== 0) r.setMinutes(m + (30 - (m % 30)));
  return r;
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function fmtTime(d: Date) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ap}`;
}
function fmtDayLong(d: Date) {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Build a 6-week grid of Date cells (null padding before/after the month).
function buildMonthCells(year: number, month: number): (Date | null)[] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function DateTimeField({
  value,
  onChange,
  minDate,
}: {
  value: Date;
  onChange: (d: Date) => void;
  minDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const [viewMonth, setViewMonth] = useState(value.getMonth());

  const min = startOfDay(minDate ?? new Date());
  // Chunk the flat cell list into weeks (rows of 7) so each row renders exactly
  // 7 flex:1 cells — avoids the subpixel rounding that drops the last column
  // when using percentage widths with flexWrap.
  const weeks = useMemo(() => {
    const cells = buildMonthCells(viewYear, viewMonth);
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewYear, viewMonth]);
  const curMin = value.getHours() * 60 + value.getMinutes();

  function openPicker() {
    setViewYear(value.getFullYear());
    setViewMonth(value.getMonth());
    setOpen(true);
  }
  function shiftMonth(delta: number) {
    const m = viewMonth + delta;
    const y = viewYear + Math.floor(m / 12);
    setViewYear(y);
    setViewMonth(((m % 12) + 12) % 12);
  }
  function pickDay(d: Date) {
    const nd = new Date(value);
    nd.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    onChange(nd);
  }
  function pickTime(m: number) {
    const nd = new Date(value);
    nd.setHours(Math.floor(m / 60), m % 60, 0, 0);
    onChange(nd);
  }

  return (
    <View>
      <TouchableOpacity
        style={styles.dateField}
        onPress={openPicker}
        activeOpacity={0.7}
      >
        <Icon name="calendar" size={16} color={COLORS.primary} />
        <Text style={styles.dateFieldText}>
          {fmtDayLong(value)} · {fmtTime(value)}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.calCard}>
            {/* Month navigation */}
            <View style={styles.calHeader}>
              <TouchableOpacity
                onPress={() => shiftMonth(-1)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.calNav}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.calMonthLabel}>
                {MONTHS_FULL[viewMonth]} {viewYear}
              </Text>
              <TouchableOpacity
                onPress={() => shiftMonth(1)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.calNav}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Weekday labels */}
            <View style={styles.calWeekRow}>
              {WEEKDAY_INITIALS.map((w, i) => (
                <Text key={i} style={styles.calWeekday}>
                  {w}
                </Text>
              ))}
            </View>

            {/* Day grid */}
            <View>
              {weeks.map((week, wi) => (
                <View key={wi} style={styles.calWeekRow}>
                  {week.map((d, i) => {
                    if (!d) return <View key={i} style={styles.calCell} />;
                    const disabled = startOfDay(d) < min;
                    const selected = sameDay(d, value);
                    return (
                      <TouchableOpacity
                        key={i}
                        style={styles.calCell}
                        disabled={disabled}
                        onPress={() => pickDay(d)}
                      >
                        <View
                          style={[
                            styles.calDayInner,
                            selected && styles.calDaySel,
                          ]}
                        >
                          <Text
                            style={[
                              styles.calDayText,
                              selected && styles.calDayTextSel,
                              disabled && styles.calDayTextDisabled,
                            ]}
                          >
                            {d.getDate()}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            {/* Time */}
            <Text style={styles.calTimeLabel}>Time</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScroll}
              contentOffset={{
                x: Math.max(0, curMin / 30 - 1) * TIME_CHIP_W,
                y: 0,
              }}
            >
              {TIME_SLOTS.map((m) => {
                const sel = m === curMin;
                const t = new Date();
                t.setHours(Math.floor(m / 60), m % 60, 0, 0);
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.timeChip, sel && styles.chipActive]}
                    onPress={() => pickTime(m)}
                  >
                    <Text
                      style={[
                        styles.timeChipText,
                        sel && styles.chipTextActive,
                      ]}
                    >
                      {fmtTime(t)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Button
              label="Done"
              height={46}
              onPress={() => setOpen(false)}
              style={{ marginTop: 16 }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function CreateEventScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const userCoords = useLocationStore((s) => s.coords);

  const [activity, setActivity] = useState<ActivityId>('coffee');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [maxPeople, setMaxPeople] = useState('4');
  const [startDate, setStartDate] = useState<Date>(() =>
    roundUpTo30(new Date(Date.now() + 60 * 60 * 1000))
  );
  const [endDate, setEndDate] = useState<Date>(() =>
    roundUpTo30(new Date(Date.now() + 3 * 60 * 60 * 1000))
  );
  const [isPublic, setIsPublic] = useState(true);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [womenOnly, setWomenOnly] = useState(false);
  // Safety popup #2 (once ever, before the first hosting) and #9 (full-screen
  // confirm every time "Female-only" is switched on).
  const [firstHostVisible, setFirstHostVisible] = useState(false);
  const [womenOnlyConfirmVisible, setWomenOnlyConfirmVisible] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pinCoords, setPinCoords] = useState(
    userCoords ?? { lat: 19.076, lng: 72.8777 }
  );
  const [locationName, setLocationName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const miniMapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    hasSeenSafetyFlag(user.id, 'first_host').then((seen) => {
      if (!cancelled && !seen) setFirstHostVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  function dismissFirstHost() {
    setFirstHostVisible(false);
    if (user) markSafetyFlagSeen(user.id, 'first_host');
  }

  function onSearchResult(r: PlaceResult) {
    setPinCoords({ lat: r.lat, lng: r.lng });
    setLocationName(r.name);
    miniMapRef.current?.animateToRegion(
      {
        latitude: r.lat,
        longitude: r.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      600
    );
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
    if (endDate <= startDate) {
      Alert.alert('Invalid time', 'The end time must be after the start time.');
      return;
    }

    try {
      setLoading(true);
      let imageUrl: string | undefined;
      if (photoUri) {
        imageUrl = await uploadEventPhoto(user.id, photoUri);
      }
      const eventId = await createEvent({
        hostId: user.id,
        activity,
        title: title.trim(),
        description: description.trim() || undefined,
        lat: pinCoords.lat,
        lng: pinCoords.lng,
        locationName: locationName || undefined,
        startsAt: startDate,
        endsAt: endDate,
        requiresApproval,
        womenOnly,
        maxPeople: maxPeople ? parseInt(maxPeople) : undefined,
        isPublic,
        imageUrl,
      });
      // Refresh the lists that should now include this event so it appears
      // immediately instead of waiting for the next poll.
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['exploreFeed'] });
      queryClient.invalidateQueries({ queryKey: ['myEvents'] });
      queryClient.invalidateQueries({ queryKey: ['joinedEvents'] });
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
        <IconButton
          icon="close"
          onPress={() => router.back()}
          accessibilityLabel="Cancel"
        />
        <Text style={styles.headerTitle}>New event</Text>
        <View style={{ width: 40 }} />
      </View>

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
                  <Icon
                    name={a.id as IconName}
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
        />

        {/* Description */}
        <Text style={styles.label}>DESCRIPTION</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Tell people what this event is about…"
          placeholderTextColor="rgba(15,24,44,0.40)"
          value={description}
          onChangeText={setDescription}
          multiline
        />

        {/* Cover photo */}
        <Text style={styles.label}>COVER PHOTO</Text>
        {photoUri ? (
          <View>
            <View style={styles.photoPicker}>
              <Image
                source={{ uri: photoUri }}
                style={styles.photoPreview}
                contentFit="cover"
              />
            </View>
            <TouchableOpacity onPress={() => setPhotoUri(null)} hitSlop={8}>
              <Text style={styles.photoRemove}>Remove photo</Text>
            </TouchableOpacity>
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
        <Text style={styles.label}>STARTS</Text>
        <DateTimeField
          value={startDate}
          onChange={(d) => {
            setStartDate(d);
            // Keep the end after the start: bump it forward by 2h if needed.
            if (endDate <= d)
              setEndDate(new Date(d.getTime() + 2 * 60 * 60 * 1000));
          }}
        />
        <Text style={styles.label}>ENDS</Text>
        <DateTimeField
          value={endDate}
          onChange={setEndDate}
          minDate={startDate}
        />
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
          bias={userCoords ?? pinCoords}
        />
        {locationName ? (
          <View style={styles.locationRow}>
            <Icon name="location" size={15} color={COLORS.primary} />
            <Text style={styles.locationName} numberOfLines={1}>
              {locationName}
            </Text>
          </View>
        ) : (
          <Text style={styles.locationHint}>
            Search above or tap the map to drop your pin.
          </Text>
        )}
        <View style={styles.mapWrapper}>
          <MapView
            ref={miniMapRef}
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
              coordinate={{
                latitude: pinCoords.lat,
                longitude: pinCoords.lng,
              }}
              anchor={{ x: 0.5, y: 1 }}
            >
              <MelloPin height={40} />
            </Marker>
          </MapView>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Publish event"
          onPress={handleCreate}
          loading={loading}
          disabled={!title.trim()}
        />
      </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FONTS.heavy,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
  scroll: { padding: 20, paddingTop: 8, gap: 7, paddingBottom: 24 },
  label: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    letterSpacing: 0.3,
    color: 'rgba(15,24,44,0.5)',
    marginTop: 10,
    marginBottom: 3,
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
    marginTop: 8,
    marginLeft: 4,
  },
  chipScroll: { gap: 8, paddingVertical: 2 },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 48,
    backgroundColor: COLORS.background,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  dateFieldText: {
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    color: COLORS.textPrimary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,24,44,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  calCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  calNav: {
    fontSize: 28,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    width: 32,
    textAlign: 'center',
  },
  calMonthLabel: {
    fontFamily: FONTS.heavy,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
  calWeekRow: { flexDirection: 'row' },
  calWeekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  calCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  calDayInner: {
    width: '100%',
    height: '100%',
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDaySel: { backgroundColor: COLORS.primary },
  calDayText: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  calDayTextSel: { color: '#fff', fontFamily: FONTS.heavy },
  calDayTextDisabled: { color: COLORS.disabled },
  calTimeLabel: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginTop: 12,
    marginBottom: 8,
  },
  timeChip: {
    width: 78,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  timeChipText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  chipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryTint,
  },
  chipTextActive: { color: COLORS.primary },
  spanSummary: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
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
