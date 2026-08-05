import { memo, useMemo, useState } from 'react';
import { Text,
  TextInput,
  View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Button, Icon, PressableScale, Sheet, Wheel } from '@/components/ui';
import {
  MAX_PEOPLE,
  MIN_PEOPLE,
  clampMaxPeople,
  eventEndTime,
  isStartInPast,
} from '@/utils/eventDraft';
import {
  dayLabel,
  dayOptions,
  dayValueOf,
  minuteValueOf,
  timeOptions,
} from '@/utils/eventSchedule';
import { fmtDayLong, fmtTime } from '@/utils/time';
import { useCreateEventStore } from '@/stores/createEventStore';
import { GLYPH_STROKE, TAP_SCALE } from '../motion';
import { StepShell } from '../StepShell';
import { themedStyles } from '@/theme';

// Built once. This used to be mapped to {value,label} inline in the JSX, which
// handed the duration wheel a brand-new options array on every render.
const DURATION_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1} ${i === 0 ? 'hour' : 'hours'}`,
}));

// Step 2 — when, how long, how many.
//
// The two pickers live here rather than beside the flow's other overlays,
// because they are this step's controls and nothing else opens them. That also
// keeps `startOpen` / `durationOpen` local: a wheel scroll now re-renders this
// step, not the whole wizard, which is what used to make every commit redraw
// the *other* open wheel's 90 rows.
export const StepWhen = memo(function StepWhen() {
  const startDate = useCreateEventStore((s) => s.startDate);
  const setStartDay = useCreateEventStore((s) => s.setStartDay);
  const setStartMinute = useCreateEventStore((s) => s.setStartMinute);
  const durationH = useCreateEventStore((s) => s.durationH);
  const setDurationH = useCreateEventStore((s) => s.setDurationH);
  const maxPeople = useCreateEventStore((s) => s.maxPeople);
  const setMaxPeople = useCreateEventStore((s) => s.setMaxPeople);
  const nudgeMaxPeople = useCreateEventStore((s) => s.nudgeMaxPeople);

  const [startOpen, setStartOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);
  const [editingPeople, setEditingPeople] = useState(false);

  // Keyed on the day itself, not on the sheet opening: the 90-entry list only
  // goes stale when midnight passes, and that is exactly when this changes.
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const days = useMemo(() => dayOptions(new Date(todayMs)), [todayMs]);
  const times = useMemo(() => timeOptions(), []);

  const maxPeopleNum = clampMaxPeople(maxPeople);
  const startInPast = isStartInPast(startDate);
  const endDate = eventEndTime(startDate, durationH);
  // The wheels address day and minute-of-day separately; `startDate` is the
  // single source of truth both are read back out of.
  const startDayValue = dayValueOf(startDate);
  const startMinuteValue = minuteValueOf(startDate);

  return (
    <StepShell>
      <Text style={styles.label}>STARTS</Text>
      {/* Non-compact datetime: one full-width row reading "Saturday 3 August ·
          7:00 PM", opening one picker. Two half-width fields side by side made
          the user think about date and time as separate decisions. */}
      <PressableScale
        scaleTo={TAP_SCALE}
        style={styles.summaryRow}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setStartOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Starts ${fmtDayLong(startDate)} at ${fmtTime(startDate)}. Change`}
      >
        <Text style={styles.summaryValue}>
          {dayLabel(startDate, new Date(todayMs))}
        </Text>
        <Text style={styles.summaryMeta}>{fmtTime(startDate)}</Text>
        <Icon
          name="chevronRight"
          size={16}
          color={COLORS.textMuted}
          strokeWidth={GLYPH_STROKE}
        />
      </PressableScale>
      {/* The Next button goes dead on a past start; say why, or the step reads
          as broken. */}
      {startInPast && (
        <Text style={styles.warning}>
          That start time has already passed — pick a later one.
        </Text>
      )}

      <Text style={styles.label}>LASTS FOR</Text>
      {/* A summary row, not 24 chips in a horizontal scroller. The scroller put
          every option on screen at once and made the common ones as hard to
          reach as the rare ones; this shows the answer and hides the choosing
          until it is asked for. */}
      <PressableScale
        scaleTo={TAP_SCALE}
        style={styles.summaryRow}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setDurationOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Lasts ${durationH} hours. Change`}
      >
        <Text style={styles.summaryValue}>
          {durationH}
          {durationH === 1 ? ' hour' : ' hours'}
        </Text>
        <Text style={styles.summaryMeta}>until {fmtTime(endDate)}</Text>
        <Icon
          name="chevronRight"
          size={16}
          color={COLORS.textMuted}
          strokeWidth={GLYPH_STROKE}
        />
      </PressableScale>

      <Text style={styles.label}>PEOPLE</Text>
      {/* Steppers only. The free-text field it replaces took any two digits and
          silently rewrote them on blur, which is why it needed a hint
          explaining the clamp; a control that cannot go out of range needs no
          explanation. */}
      <View style={styles.peopleRow}>
        <PressableScale
          scaleTo={TAP_SCALE}
          style={[
            styles.stepperBtn,
            maxPeopleNum <= MIN_PEOPLE && styles.stepperBtnOff,
          ]}
          disabled={maxPeopleNum <= MIN_PEOPLE}
          onPress={() => {
            Haptics.selectionAsync();
            nudgeMaxPeople(-1);
          }}
          accessibilityRole="button"
          accessibilityLabel="One fewer person"
        >
          <Icon name="minus" size={20} color={COLORS.white} strokeWidth={2.6} />
        </PressableScale>
        {/* Tap the number to type it. The steppers are right for nudging by one
            and wrong for going from 4 to 30, which is why the free-text field
            this replaced existed at all — but it is only a field while it is
            being edited, so the clamp still cannot bite silently: it applies on
            blur, in view. */}
        <PressableScale
          scaleTo={TAP_SCALE}
          style={styles.peopleValueWrap}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setEditingPeople(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${maxPeopleNum} people. Tap to type a number`}
        >
          {editingPeople ? (
            <TextInput
              style={styles.peopleInput}
              value={maxPeople}
              onChangeText={(t) =>
                setMaxPeople(t.replace(/[^0-9]/g, '').slice(0, 2))
              }
              onBlur={() => {
                setMaxPeople(String(maxPeopleNum));
                setEditingPeople(false);
              }}
              keyboardType="number-pad"
              returnKeyType="done"
              selectTextOnFocus
              autoFocus
            />
          ) : (
            <Text style={styles.peopleValue}>{maxPeopleNum}</Text>
          )}
          <Text style={styles.peopleUnit}>people incl. you</Text>
        </PressableScale>
        <PressableScale
          scaleTo={TAP_SCALE}
          style={[
            styles.stepperBtn,
            maxPeopleNum >= MAX_PEOPLE && styles.stepperBtnOff,
          ]}
          disabled={maxPeopleNum >= MAX_PEOPLE}
          onPress={() => {
            Haptics.selectionAsync();
            nudgeMaxPeople(1);
          }}
          accessibilityRole="button"
          accessibilityLabel="One more person"
        >
          <Icon name="plus" size={20} color={COLORS.white} strokeWidth={2.6} />
        </PressableScale>
      </View>

      {/* Date and time as two columns of the same wheel, so picking a start is
          one gesture language rather than a calendar plus a grid. Day and
          minute-of-day are kept apart and recombined on change — a single list
          of every slot in 90 days would be 4,320 rows. */}
      <Sheet
        visible={startOpen}
        animation="slide"
        grabber
        onClose={() => setStartOpen(false)}
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle}>Starts</Text>
          <View style={styles.wheelRow}>
            <Wheel
              style={styles.wheelFlex}
              options={days}
              value={startDayValue}
              onChange={setStartDay}
            />
            <Wheel
              style={styles.wheelFlex}
              options={times}
              value={startMinuteValue}
              onChange={setStartMinute}
            />
          </View>
          {startInPast && (
            <Text style={styles.warning}>
              That start time has already passed — pick a later one.
            </Text>
          )}
          <Button
            variant="secondary"
            label="Done"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setStartOpen(false);
            }}
          />
        </View>
      </Sheet>

      <Sheet
        visible={durationOpen}
        animation="slide"
        grabber
        onClose={() => setDurationOpen(false)}
      >
        {/* Sheet supplies no horizontal padding — callers own their own
            gutters — so the content sets them here. */}
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle}>Lasts for</Text>
          <Wheel
            options={DURATION_OPTIONS}
            value={durationH}
            onChange={setDurationH}
          />
          <Button
            variant="secondary"
            label="Done"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setDurationOpen(false);
            }}
          />
        </View>
      </Sheet>
    </StepShell>
  );
});

const styles = themedStyles(() => ({
  label: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    letterSpacing: 0.3,
    color: COLORS.inkLabel,
    // Generous above, tight below: the gap separates one group from the last,
    // while the label stays visually attached to the control it names.
    marginTop: SPACING[5],
    marginBottom: SPACING[1],
  },
  warning: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.error,
    marginTop: SPACING[1.5],
  },
  // A value the user can read at a glance with the choosing tucked behind it.
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    height: 52,
    paddingHorizontal: SPACING[4],
    borderRadius: RADIUS.md,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING[1],
  },
  summaryValue: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  summaryMeta: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
  // No tray. The two buttons carry the weight on their own, so the row reads as
  // a control rather than as another filled field stacked under the two above.
  peopleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    marginTop: SPACING[1],
  },
  peopleValueWrap: { alignItems: 'center', minWidth: 96 },
  // Same metrics as the label it replaces, so swapping between them does not
  // shift the row.
  peopleInput: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    color: COLORS.textPrimary,
    textAlign: 'center',
    padding: 0,
    minWidth: 60,
  },
  // Bigger now that there is no tray holding the row together — the number is
  // what carries it, so it has to be the thing the eye lands on.
  peopleValue: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    color: COLORS.textPrimary,
  },
  peopleUnit: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
  },
  // The app black, per the button rule: this is a workhorse control, not a
  // primary action, and coral here would compete with Next.
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnOff: { opacity: 0.4 },
  sheetBody: { paddingHorizontal: SPACING[5], paddingTop: SPACING[5] },
  sheetTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.sectionLg,
    color: COLORS.textPrimary,
  },
  // The two date/time columns share the sheet's width.
  wheelFlex: { flex: 1 },
  // Two wheels abreast for date + time; the band spans each column separately
  // so the pair reads as one control rather than two stacked lists.
  wheelRow: { flexDirection: 'row', gap: SPACING[3] },
}));
