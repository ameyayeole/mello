import {
  clampMaxPeople,
  canAdvanceFrom,
  eventEndTime,
  isStartInPast,
  MIN_PEOPLE,
  MAX_PEOPLE,
  DEFAULT_PEOPLE,
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
