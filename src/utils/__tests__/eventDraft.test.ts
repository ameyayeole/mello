import {
  clampMaxPeople,
  canAdvanceFrom,
  eventEndTime,
  isStartInPast,
  parseDraft,
  draftHasWork,
  DRAFT_VERSION,
  DRAFT_TTL_MS,
  MIN_PEOPLE,
  MAX_PEOPLE,
  DEFAULT_PEOPLE,
  TITLE_MAX,
  DESCRIPTION_MAX,
  STEP_COUNT,
  type StoredEventDraft,
} from '../eventDraft';

describe('clampMaxPeople', () => {
  it('keeps a value inside the allowed range', () => {
    expect(clampMaxPeople('12')).toBe(12);
    expect(clampMaxPeople(String(MIN_PEOPLE))).toBe(MIN_PEOPLE);
    expect(clampMaxPeople(String(MAX_PEOPLE))).toBe(MAX_PEOPLE);
  });

  // The real ceiling is 50. A dead validation module used to claim 20, and had
  // it ever been wired up it would have rejected parties the app allows.
  it('clamps to the real bounds rather than the ones the dead module claimed', () => {
    expect(clampMaxPeople('999')).toBe(50);
    expect(clampMaxPeople('21')).toBe(21);
    expect(clampMaxPeople('1')).toBe(MIN_PEOPLE);
    expect(clampMaxPeople('0')).toBe(MIN_PEOPLE);
    expect(clampMaxPeople('-5')).toBe(MIN_PEOPLE);
  });

  // Free-text field, so it has to survive whatever gets typed.
  it.each([
    ['empty', ''],
    ['letters', 'abc'],
    ['whitespace', '   '],
    ['a symbol', '-'],
  ])('falls back to the default for %s', (_label, input) => {
    expect(clampMaxPeople(input)).toBe(DEFAULT_PEOPLE);
  });

  it('reads the leading number out of mixed input', () => {
    expect(clampMaxPeople('12 people')).toBe(12);
    expect(clampMaxPeople('8.9')).toBe(8);
  });

  // Regression guard: the old inline version used `parseInt(x, 10) || 4`, so a
  // parsed 0 fell through to the default and then clamped to 2 anyway. Same
  // answer, but only by luck — this pins the intent.
  it('treats zero as too small rather than as missing', () => {
    expect(clampMaxPeople('0')).toBe(MIN_PEOPLE);
  });
});

describe('canAdvanceFrom', () => {
  const draft = { activity: 'coffee', title: 'Flat white' };

  it('requires an activity on the first step', () => {
    expect(canAdvanceFrom(0, { ...draft, activity: null })).toBe(false);
    expect(canAdvanceFrom(0, draft)).toBe(true);
  });

  it('requires a non-blank title on the second step', () => {
    expect(canAdvanceFrom(1, { ...draft, title: '' })).toBe(false);
    expect(canAdvanceFrom(1, { ...draft, title: '   ' })).toBe(false);
    expect(canAdvanceFrom(1, draft)).toBe(true);
  });

  it('lets the remaining steps through, since they all have defaults', () => {
    expect(canAdvanceFrom(2, { activity: null, title: '' })).toBe(true);
    expect(canAdvanceFrom(3, { activity: null, title: '' })).toBe(true);
    expect(canAdvanceFrom(4, { activity: null, title: '' })).toBe(true);
  });

  // The bug this guard exists for: the time grid has no floor, so today plus an
  // earlier slot used to sail through every layer and create an event that had
  // already ended.
  it('blocks the when-step when the start has already passed', () => {
    const now = new Date('2026-08-03T18:00:00Z');
    const draft = { activity: 'coffee', title: 'Flat white' };
    expect(
      canAdvanceFrom(2, { ...draft, startDate: new Date('2026-08-03T17:30:00Z') }, now)
    ).toBe(false);
    expect(
      canAdvanceFrom(2, { ...draft, startDate: new Date('2026-08-03T19:00:00Z') }, now)
    ).toBe(true);
  });

  // Only the when-step looks at the date — a past start must not wedge the user
  // on an unrelated step they cannot fix from.
  it('ignores the start date on every other step', () => {
    const now = new Date('2026-08-03T18:00:00Z');
    const past = new Date('2026-08-03T17:00:00Z');
    const draft = { activity: 'coffee', title: 'Flat white', startDate: past };
    expect(canAdvanceFrom(0, draft, now)).toBe(true);
    expect(canAdvanceFrom(1, draft, now)).toBe(true);
    expect(canAdvanceFrom(3, draft, now)).toBe(true);
    expect(canAdvanceFrom(4, draft, now)).toBe(true);
  });

  // Callers that have not reached the when-step yet pass no date at all.
  it('treats a missing start date as nothing to check', () => {
    expect(canAdvanceFrom(2, { activity: 'coffee', title: 'x' })).toBe(true);
  });
});

describe('isStartInPast', () => {
  const now = new Date('2026-08-03T18:00:00Z');

  it('is true only for instants strictly before now', () => {
    expect(isStartInPast(new Date('2026-08-03T17:59:59Z'), now)).toBe(true);
    expect(isStartInPast(new Date('2026-08-03T18:00:01Z'), now)).toBe(false);
  });

  // Exactly now is not "in the past" — rounding a start to the current minute
  // is a legitimate thing the default start can land on.
  it('treats the current instant as not past', () => {
    expect(isStartInPast(new Date(now), now)).toBe(false);
  });
});

describe('eventEndTime', () => {
  it('adds the duration in hours', () => {
    const start = new Date('2026-07-20T19:00:00Z');
    expect(eventEndTime(start, 2).toISOString()).toBe(
      '2026-07-20T21:00:00.000Z'
    );
  });

  it('handles fractional hours and rolls over midnight', () => {
    const start = new Date('2026-07-20T23:00:00Z');
    expect(eventEndTime(start, 1.5).toISOString()).toBe(
      '2026-07-21T00:30:00.000Z'
    );
  });

  it('does not mutate the start date', () => {
    const start = new Date('2026-07-20T19:00:00Z');
    eventEndTime(start, 3);
    expect(start.toISOString()).toBe('2026-07-20T19:00:00.000Z');
  });
});

describe('draftHasWork', () => {
  const empty = {
    activity: null,
    title: '',
    description: '',
    photoUri: null,
  };

  it('is false for a draft holding only defaults', () => {
    expect(draftHasWork(empty)).toBe(false);
  });

  // Whitespace is not work — it is what a stray keystroke leaves behind.
  it('ignores whitespace-only text', () => {
    expect(draftHasWork({ ...empty, title: '   ' })).toBe(false);
    expect(draftHasWork({ ...empty, description: '\n  ' })).toBe(false);
  });

  it.each([
    ['an activity', { activity: 'coffee' }],
    ['a title', { title: 'Flat white' }],
    ['a description', { description: 'come along' }],
    ['a photo', { photoUri: 'file:///tmp/a.jpg' }],
  ])('is true once there is %s', (_label, patch) => {
    expect(draftHasWork({ ...empty, ...patch })).toBe(true);
  });
});

describe('parseDraft', () => {
  const NOW = 1_800_000_000_000;

  function stored(over: Partial<StoredEventDraft> = {}): string {
    const base: StoredEventDraft = {
      version: DRAFT_VERSION,
      savedAt: NOW - 1000,
      step: 2,
      coord: { lat: 19.076, lng: 72.8777 },
      locationName: 'Bandra',
      activity: 'coffee',
      title: 'Flat white',
      description: 'come along',
      photoUri: null,
      startsAt: NOW + 3_600_000,
      durationH: 2,
      maxPeople: '4',
      isPublic: true,
      requiresApproval: false,
      womenOnly: false,
    };
    return JSON.stringify({ ...base, ...over });
  }

  it('round-trips a draft it wrote itself', () => {
    const d = parseDraft(stored(), NOW);
    expect(d).not.toBeNull();
    expect(d!.title).toBe('Flat white');
    expect(d!.activity).toBe('coffee');
    expect(d!.coord).toEqual({ lat: 19.076, lng: 72.8777 });
    expect(d!.startsAt).toBe(NOW + 3_600_000);
  });

  // Nothing a corrupt value can do may stop someone hosting, so every one of
  // these has to come back as "no draft" rather than as a throw.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['not JSON', '{oh no'],
    ['a JSON scalar', '42'],
    ['a JSON array', '[]'],
    ['JSON null', 'null'],
  ])('returns null for %s', (_label, raw) => {
    expect(parseDraft(raw as string | null | undefined, NOW)).toBeNull();
  });

  it('drops a draft written by another version', () => {
    expect(parseDraft(stored({ version: DRAFT_VERSION + 1 }), NOW)).toBeNull();
    expect(parseDraft(stored({ version: undefined }), NOW)).toBeNull();
  });

  it('drops a draft past its time to live', () => {
    expect(parseDraft(stored({ savedAt: NOW - DRAFT_TTL_MS - 1 }), NOW)).toBeNull();
    expect(parseDraft(stored({ savedAt: NOW - DRAFT_TTL_MS + 1 }), NOW)).not.toBeNull();
  });

  // A clock that jumped backwards would otherwise leave a draft that never
  // expires, because now - savedAt stays negative forever.
  it('drops a draft saved implausibly far in the future', () => {
    expect(parseDraft(stored({ savedAt: NOW + DRAFT_TTL_MS * 2 }), NOW)).toBeNull();
  });

  it('drops a draft holding nothing but defaults', () => {
    const bare = stored({
      activity: null,
      title: '',
      description: '',
      photoUri: null,
    });
    expect(parseDraft(bare, NOW)).toBeNull();
  });

  it('rejects a missing or non-numeric start', () => {
    expect(parseDraft(stored({ startsAt: undefined }), NOW)).toBeNull();
    expect(parseDraft(stored({ startsAt: NaN }), NOW)).toBeNull();
  });

  // A past start survives restore on purpose: canAdvanceFrom then blocks the
  // when-step with a visible reason, which beats silently deleting the work.
  it('keeps a draft whose start has already passed', () => {
    const d = parseDraft(stored({ startsAt: NOW - 3_600_000 }), NOW);
    expect(d).not.toBeNull();
    expect(isStartInPast(new Date(d!.startsAt), new Date(NOW))).toBe(true);
  });

  it('clamps a step outside the wizard instead of dropping the draft', () => {
    expect(parseDraft(stored({ step: -3 }), NOW)!.step).toBe(0);
    expect(parseDraft(stored({ step: 99 }), NOW)!.step).toBe(STEP_COUNT - 1);
    expect(parseDraft(stored({ step: 1.7 }), NOW)!.step).toBe(1);
    expect(parseDraft(stored({ step: undefined }), NOW)!.step).toBe(0);
  });

  it('re-applies the field limits to stored text', () => {
    const d = parseDraft(
      stored({ title: 'x'.repeat(200), description: 'y'.repeat(900) }),
      NOW
    )!;
    expect(d.title).toHaveLength(TITLE_MAX);
    expect(d.description).toHaveLength(DESCRIPTION_MAX);
  });

  it('re-clamps a stored party size through the same rule as the field', () => {
    expect(parseDraft(stored({ maxPeople: '999' }), NOW)!.maxPeople).toBe(
      String(MAX_PEOPLE)
    );
    expect(parseDraft(stored({ maxPeople: '1' }), NOW)!.maxPeople).toBe(
      String(MIN_PEOPLE)
    );
    expect(parseDraft(stored({ maxPeople: 'abc' }), NOW)!.maxPeople).toBe(
      String(DEFAULT_PEOPLE)
    );
  });

  it('drops a half-written coordinate rather than restoring half a pin', () => {
    expect(parseDraft(stored({ coord: { lat: 19.076 } as never }), NOW)!.coord).toBeNull();
    expect(parseDraft(stored({ coord: null }), NOW)!.coord).toBeNull();
  });

  // isPublic defaults on, the other two default off; a missing value must land
  // on the same default the fresh form uses.
  it('falls back to the form defaults for missing toggles', () => {
    const d = parseDraft(
      stored({ isPublic: undefined, requiresApproval: undefined, womenOnly: undefined }),
      NOW
    )!;
    expect(d.isPublic).toBe(true);
    expect(d.requiresApproval).toBe(false);
    expect(d.womenOnly).toBe(false);
  });
});
