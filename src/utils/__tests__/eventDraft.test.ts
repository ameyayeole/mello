import {
  clampMaxPeople,
  canAdvanceFrom,
  eventEndTime,
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
