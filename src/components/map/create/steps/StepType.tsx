import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { ACTIVITIES, SECTIONS } from '@/constants/activities';
import { useCreateEventStore } from '@/stores/createEventStore';
import { SectionPills } from '../SectionPills';
import { StepShell } from '../StepShell';
import { TypeGrid } from '../TypeGrid';

// Hoisted so `SectionPills` gets the same array every render — built inline it
// was a new reference each time, which silently defeats the memo on it.
const SECTION_OPTIONS = [{ id: 'all' as const, label: 'All' }, ...SECTIONS];

// Step 0 — what kind of thing is this.
//
// Takes no props, and that is the point: with nothing passed in, `memo` holds
// against every re-render of the flow above it. This step draws 52 tiles, and
// it used to redraw all of them whenever the map panned underneath.
export const StepType = memo(function StepType() {
  const sectionFilter = useCreateEventStore((s) => s.sectionFilter);
  const setSectionFilter = useCreateEventStore((s) => s.setSectionFilter);
  const activity = useCreateEventStore((s) => s.activity);
  const setActivity = useCreateEventStore((s) => s.setActivity);

  const visibleActivities = useMemo(
    () =>
      sectionFilter === 'all'
        ? ACTIVITIES
        : ACTIVITIES.filter((a) => a.section === sectionFilter),
    [sectionFilter]
  );

  return (
    <StepShell>
      {/* Category pills narrow the grid down; "All" is the default so nothing
          is hidden until you choose. */}
      <SectionPills
        sections={SECTION_OPTIONS}
        value={sectionFilter}
        onChange={setSectionFilter}
      />
      <ScrollView
        style={styles.typeScroll}
        contentContainerStyle={styles.typeScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TypeGrid
          activities={visibleActivities}
          value={activity}
          onChange={setActivity}
        />
      </ScrollView>
    </StepShell>
  );
});

const styles = StyleSheet.create({
  typeScroll: { flex: 1, marginTop: SPACING[3], marginHorizontal: -4 },
  // The top padding is not decoration. PressableScale springs back underdamped,
  // so a tile briefly scales *past* 1 on release; without headroom the scroll
  // view clips that overshoot and the first row's tiles lose their top edge
  // mid-bounce. The padding is the room the overshoot needs.
  typeScrollContent: {
    paddingHorizontal: SPACING[1],
    paddingTop: SPACING[1],
    paddingBottom: SPACING[2],
  },
});
