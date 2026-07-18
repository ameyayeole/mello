import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, Icon } from '@/components/ui';

// ─── Pure-JS date/time span picker ──────────────────────────────────────────
// No native datetime module (not in the build), so we render a custom calendar
// month grid + a time list inside a modal. Formatting is done manually to avoid
// relying on Intl in Hermes. Shared by the create-event and edit-event screens.
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

export function roundUpTo30(d: Date) {
  const r = new Date(d);
  r.setSeconds(0, 0);
  const m = r.getMinutes();
  if (m % 30 !== 0) r.setMinutes(m + (30 - (m % 30)));
  return r;
}
export function sameDay(a: Date, b: Date) {
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
export function fmtTime(d: Date) {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ap}`;
}
export function fmtDayLong(d: Date) {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
// Compact label for the side-by-side start/end fields, where the full long date
// won't fit at half width: "12 Jan · 10:00 AM".
export function fmtDayShort(d: Date) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
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

export default function DateTimeField({
  value,
  onChange,
  minDate,
  compact,
}: {
  value: Date;
  onChange: (d: Date) => void;
  minDate?: Date;
  compact?: boolean;
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
        style={[styles.dateField, compact && styles.dateFieldCompact]}
        onPress={openPicker}
        activeOpacity={0.7}
      >
        <Icon name="calendar" size={16} color={COLORS.primary} />
        <Text style={styles.dateFieldText} numberOfLines={1}>
          {compact
            ? `${fmtDayShort(value)} · ${fmtTime(value)}`
            : `${fmtDayLong(value)} · ${fmtTime(value)}`}
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

const styles = StyleSheet.create({
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
  dateFieldCompact: {
    gap: 6,
    paddingHorizontal: 11,
  },
  dateFieldText: {
    flexShrink: 1,
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
});
