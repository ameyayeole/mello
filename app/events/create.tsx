import { useMemo, useState } from 'react';
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
  Modal,
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
      <TouchableOpacity style={styles.dateField} onPress={openPicker}>
        <Text style={styles.dateFieldText}>
          {fmtDayLong(value)}  ·  {fmtTime(value)}
        </Text>
        <Text style={styles.dateFieldIcon}>📅</Text>
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
              contentOffset={{ x: Math.max(0, curMin / 30 - 1) * TIME_CHIP_W, y: 0 }}
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
                      style={[styles.timeChipText, sel && styles.chipTextActive]}
                    >
                      {fmtTime(t)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.calDone}
              onPress={() => setOpen(false)}
            >
              <Text style={styles.calDoneText}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function CreateEventScreen() {
  const router = useRouter();
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
    if (endDate <= startDate) {
      Alert.alert('Invalid time', 'The end time must be after the start time.');
      return;
    }

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
        startsAt: startDate,
        endsAt: endDate,
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

        {/* When */}
        <Text style={styles.label}>Starts</Text>
        <DateTimeField
          value={startDate}
          onChange={(d) => {
            setStartDate(d);
            // Keep the end after the start: bump it forward by 2h if needed.
            if (endDate <= d) setEndDate(new Date(d.getTime() + 2 * 60 * 60 * 1000));
          }}
        />
        <Text style={styles.label}>Ends</Text>
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
  chipScroll: { gap: 8, paddingVertical: 2 },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dateFieldText: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  dateFieldIcon: { fontSize: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  calCard: {
    backgroundColor: COLORS.background,
    borderRadius: 20,
    padding: 16,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  calNav: { fontSize: 28, fontWeight: '700', color: COLORS.primary, width: 32, textAlign: 'center' },
  calMonthLabel: { fontSize: 17, fontWeight: '800', color: COLORS.textPrimary },
  calWeekRow: { flexDirection: 'row' },
  calWeekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
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
  calDayText: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  calDayTextSel: { color: '#fff', fontWeight: '800' },
  calDayTextDisabled: { color: COLORS.border },
  calTimeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 12,
    marginBottom: 8,
  },
  calDone: {
    backgroundColor: COLORS.primary,
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  calDoneText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  timeChip: {
    width: 78,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  timeChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  chipActive: { borderColor: COLORS.primary, backgroundColor: '#FFF0EF' },
  chipTextActive: { color: COLORS.primary },
  spanSummary: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 6,
    fontWeight: '600',
  },
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
