import { formatEventTime, splitEventTime } from '../time';

// Both helpers branch on "is this today", so the clock is pinned. Without this
// every assertion below would pass or fail depending on the hour it ran.
const NOW = new Date('2026-07-20T12:00:00');

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});
afterAll(() => {
  jest.useRealTimers();
});

// Local time on purpose: the helpers read `getHours()`, so a UTC literal would
// land on a different hour — and a different label — depending on the machine.
const at = (iso: string) => new Date(iso).toISOString();

describe('day labels agree between the card and the sheet', () => {
  // The bug these lock down: the sheet carried its own copy of this logic that
  // knew about "Tonight" while formatEventTime did not, so one event rendered
  // "Today 7:00 PM" on a card and "Tonight" in the sheet.
  it.each([
    ['an evening event today', '2026-07-20T19:00:00', 'Tonight'],
    ['exactly 5pm, the evening boundary', '2026-07-20T17:00:00', 'Tonight'],
    ['just before 5pm', '2026-07-20T16:59:00', 'Today'],
    ['a morning event today', '2026-07-20T09:30:00', 'Today'],
    ['tomorrow evening', '2026-07-21T19:00:00', 'Tomorrow'],
    ['tomorrow morning', '2026-07-21T08:00:00', 'Tomorrow'],
  ])('%s reads "%s" in both', (_label, iso, expected) => {
    expect(splitEventTime(at(iso)).dateShort).toBe(expected);
    expect(formatEventTime(at(iso)).startsWith(expected)).toBe(true);
  });
});

describe('formatEventTime', () => {
  it('appends the time to a near-term label', () => {
    expect(formatEventTime(at('2026-07-20T19:00:00'))).toBe('Tonight 7:00 PM');
  });

  it('uses its own one-line format once the event is further out', () => {
    expect(formatEventTime(at('2026-07-27T19:00:00'))).toBe('Jul 27, 7:00 PM');
  });
});

describe('splitEventTime', () => {
  it('splits into a day label and a short time', () => {
    expect(splitEventTime(at('2026-07-20T19:00:00'))).toEqual({
      dateShort: 'Tonight',
      timeShort: '7:00 PM',
    });
  });

  // The two formats diverge past "tomorrow" on purpose: the card is one line,
  // the sheet is two. Only the near-term labels have to agree.
  it('uses a weekday format for far dates, unlike the card', () => {
    const far = at('2026-07-27T19:00:00');
    expect(splitEventTime(far)).toEqual({
      dateShort: 'Mon, 27 Jul',
      timeShort: '7:00 PM',
    });
    expect(formatEventTime(far)).toBe('Jul 27, 7:00 PM');
  });
});
