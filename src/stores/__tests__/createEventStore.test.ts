import {
  CreateEventDraft,
  draftInputFrom,
  draftStateFrom,
  initialDraft,
  useCreateEventStore,
} from '@/stores/createEventStore';
import {
  DRAFT_VERSION,
  MAX_PEOPLE,
  MIN_PEOPLE,
  STEP_COUNT,
  StoredEventDraft,
} from '@/utils/eventDraft';

// The store is deliberately free of React Native imports so it can be driven
// directly — see the note at the top of createEventStore.ts. These tests are
// the reason that constraint exists.

function storedDraft(over: Partial<StoredEventDraft> = {}): StoredEventDraft {
  return {
    version: DRAFT_VERSION,
    savedAt: Date.now(),
    step: 2,
    coord: { lat: 19.076, lng: 72.8777 },
    locationName: 'Bandra',
    activity: 'coffee',
    title: 'Sunset drinks',
    description: 'Short and inviting',
    photoUri: 'file:///photo.jpg',
    startsAt: new Date('2026-08-04T19:00:00Z').getTime(),
    durationH: 3,
    maxPeople: '8',
    isPublic: false,
    requiresApproval: true,
    womenOnly: true,
    ...over,
  };
}

beforeEach(() => {
  useCreateEventStore.setState(initialDraft());
});

describe('draftInputFrom / draftStateFrom', () => {
  // The round trip is the point. Dropping a field from either mapping produces
  // no type error and no crash — just a draft that quietly forgets a field.
  it('round-trips every stored field', () => {
    const stored = storedDraft();
    const state = { ...initialDraft(), ...draftStateFrom(stored) };
    const back = draftInputFrom(state as CreateEventDraft);

    expect(back).toEqual({
      step: stored.step,
      coord: stored.coord,
      locationName: stored.locationName,
      activity: stored.activity,
      title: stored.title,
      description: stored.description,
      photoUri: stored.photoUri,
      startsAt: stored.startsAt,
      durationH: stored.durationH,
      maxPeople: stored.maxPeople,
      isPublic: stored.isPublic,
      requiresApproval: stored.requiresApproval,
      womenOnly: stored.womenOnly,
    });
  });

  // Guards the mapping against a field being added to the stored shape and
  // silently never being carried across.
  it('carries every persisted key, so a new field cannot be forgotten', () => {
    const stored = storedDraft();
    const carried = Object.keys(draftInputFrom(
      { ...initialDraft(), ...draftStateFrom(stored) } as CreateEventDraft
    ));
    const persisted = Object.keys(stored).filter(
      (k) => k !== 'version' && k !== 'savedAt' && k !== 'startsAt'
    );
    for (const key of persisted) expect(carried).toContain(key);
    expect(carried).toContain('startsAt');
  });

  it('converts startsAt to a Date and back without drift', () => {
    const stored = storedDraft({ startsAt: 1_754_334_000_000 });
    const state = draftStateFrom(stored);
    expect(state.startDate).toBeInstanceOf(Date);
    expect(state.startDate!.getTime()).toBe(1_754_334_000_000);
  });

  // phase is the caller's decision, because only a draft with a coordinate can
  // reopen the form and that rule lives with the camera move.
  it('does not decide phase', () => {
    expect(draftStateFrom(storedDraft())).not.toHaveProperty('phase');
  });
});

describe('step navigation', () => {
  it('stops at the last step', () => {
    useCreateEventStore.setState({ step: STEP_COUNT - 1 });
    useCreateEventStore.getState().next();
    expect(useCreateEventStore.getState().step).toBe(STEP_COUNT - 1);
  });

  it('stops at the first step', () => {
    useCreateEventStore.getState().back();
    expect(useCreateEventStore.getState().step).toBe(0);
  });

  it('clamps a step set out of range', () => {
    useCreateEventStore.getState().setStep(99);
    expect(useCreateEventStore.getState().step).toBe(STEP_COUNT - 1);
    useCreateEventStore.getState().setStep(-4);
    expect(useCreateEventStore.getState().step).toBe(0);
  });
});

describe('nudgeMaxPeople', () => {
  it('will not go below the minimum', () => {
    useCreateEventStore.setState({ maxPeople: String(MIN_PEOPLE) });
    useCreateEventStore.getState().nudgeMaxPeople(-1);
    expect(useCreateEventStore.getState().maxPeople).toBe(String(MIN_PEOPLE));
  });

  it('will not go above the maximum', () => {
    useCreateEventStore.setState({ maxPeople: String(MAX_PEOPLE) });
    useCreateEventStore.getState().nudgeMaxPeople(1);
    expect(useCreateEventStore.getState().maxPeople).toBe(String(MAX_PEOPLE));
  });

  // The field is free text, so the stepper has to cope with whatever was typed
  // into it before the blur clamped anything.
  it('recovers from junk in the field', () => {
    useCreateEventStore.setState({ maxPeople: 'abc' });
    useCreateEventStore.getState().nudgeMaxPeople(1);
    expect(Number(useCreateEventStore.getState().maxPeople)).toBeGreaterThanOrEqual(
      MIN_PEOPLE
    );
  });
});

describe('start time', () => {
  it('changes the day without moving the time', () => {
    const start = new Date('2026-08-03T19:30:00');
    useCreateEventStore.setState({ startDate: start });
    useCreateEventStore
      .getState()
      .setStartDay(new Date('2026-08-09T00:00:00').getTime());

    const next = useCreateEventStore.getState().startDate;
    expect(next.getDate()).toBe(9);
    expect(next.getHours()).toBe(19);
    expect(next.getMinutes()).toBe(30);
  });

  it('changes the time without moving the day', () => {
    const start = new Date('2026-08-03T19:30:00');
    useCreateEventStore.setState({ startDate: start });
    useCreateEventStore.getState().setStartMinute(8 * 60 + 15);

    const next = useCreateEventStore.getState().startDate;
    expect(next.getDate()).toBe(3);
    expect(next.getHours()).toBe(8);
    expect(next.getMinutes()).toBe(15);
  });

  // Both setters write a new Date rather than mutating in place, or a
  // subscriber comparing by reference would never see the change.
  it('produces a new Date instance', () => {
    const start = new Date('2026-08-03T19:30:00');
    useCreateEventStore.setState({ startDate: start });
    useCreateEventStore.getState().setStartMinute(600);
    expect(useCreateEventStore.getState().startDate).not.toBe(start);
  });
});

describe('reset', () => {
  it('clears every field the user filled in', () => {
    useCreateEventStore.getState().hydrate(storedDraft());
    useCreateEventStore.getState().setPhase('form');
    useCreateEventStore.getState().reset();

    const s = useCreateEventStore.getState();
    expect(s.phase).toBe('drop');
    expect(s.step).toBe(0);
    expect(s.activity).toBeNull();
    expect(s.title).toBe('');
    expect(s.description).toBe('');
    expect(s.photoUri).toBeNull();
    expect(s.coord).toBeNull();
    expect(s.womenOnly).toBe(false);
    expect(s.sectionFilter).toBe('all');
  });

  // Recomputed rather than captured at module load: a session left open
  // overnight would otherwise reset to a start time already in the past.
  it('gives a fresh start time in the future', () => {
    useCreateEventStore.getState().reset();
    expect(
      useCreateEventStore.getState().startDate.getTime()
    ).toBeGreaterThan(Date.now());
  });
});
