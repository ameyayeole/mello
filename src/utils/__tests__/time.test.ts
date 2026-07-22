import {
  chatDayLabel,
  eventDayLabel,
  formatEventWhen,
  relativeWhen,
  shortRelativeTime,
  splitEventTime,
  startsNewDay,
} from '../time';

// Every helper here branches on "is this today", so the clock is pinned.
// Without this each assertion would pass or fail depending on the hour it ran.
// 2026-07-20 is a Monday, which is what makes the weekday cases below readable.
const NOW = new Date('2026-07-20T12:00:00');

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});
afterAll(() => {
  jest.useRealTimers();
});

// Local time on purpose: the helpers compare against the local clock, so a UTC
// literal would land on a different hour — and a different label — depending on
// the machine.
const at = (iso: string) => new Date(iso).toISOString();

describe('eventDayLabel — the ladder every surface climbs', () => {
  it.each([
    ['an event that already started', '2026-07-20T09:00:00', 'Completed'],
    ['later today', '2026-07-20T19:00:00', 'Today'],
    ['tomorrow', '2026-07-21T19:00:00', 'Tomorrow'],
    ['three days out', '2026-07-23T19:00:00', 'Thursday'],
    ['six days out, the last weekday', '2026-07-26T19:00:00', 'Sunday'],
    // A seventh "Monday" would be ambiguous with today, which is the whole
    // reason the ladder stops naming weekdays here.
    ['a week out', '2026-07-27T19:00:00', 'Mon, Jul 27'],
  ])('%s reads "%s"', (_label, iso, expected) => {
    expect(eventDayLabel(at(iso))).toBe(expected);
  });
});

describe('relativeWhen — the standalone badge', () => {
  it.each([
    ['a finished event', '2026-07-20T09:00:00', 'Completed'],
    ['half an hour away', '2026-07-20T12:30:00', 'in 30 min'],
    ['an hour away, singular', '2026-07-20T13:00:00', 'in 1 hour'],
    ['this evening', '2026-07-20T19:00:00', 'in 7 hours'],
    ['tomorrow', '2026-07-21T19:00:00', 'Tomorrow'],
    ['three days out', '2026-07-23T19:00:00', 'Thursday'],
    // No weekday on the far case: the badge is the narrowest thing on a card.
    ['a week out', '2026-07-27T19:00:00', 'Jul 27'],
  ])('%s reads "%s"', (_label, iso, expected) => {
    expect(relativeWhen(at(iso))).toBe(expected);
  });

  // The bug that started all of this: a finished event wearing "22 hours ago",
  // which is a fact about the clock rather than about the event.
  it('never describes a finished event as an age', () => {
    expect(relativeWhen(at('2026-07-19T14:00:00'))).toBe('Completed');
  });
});

describe('formatEventWhen — the day-and-time line', () => {
  it('leads with the ladder label, then the clock time', () => {
    expect(formatEventWhen(at('2026-07-20T19:00:00'))).toBe('Today · 7:00 PM');
  });

  it('spells out the date once the event is more than a week out', () => {
    expect(formatEventWhen(at('2026-07-27T19:00:00'))).toBe(
      'Mon, Jul 27 · 7:00 PM'
    );
  });

  // Once it's over, the hour it started at is noise.
  it('drops the time from a completed event', () => {
    expect(formatEventWhen(at('2026-07-20T09:00:00'))).toBe('Completed');
  });
});

describe('splitEventTime — the sheet’s two-line form', () => {
  it('splits into the same day label and a short time', () => {
    expect(splitEventTime(at('2026-07-20T19:00:00'))).toEqual({
      dateShort: 'Today',
      timeShort: '7:00 PM',
    });
  });

  // The regression this file has always guarded: the sheet once carried a
  // private copy of the day logic and drifted from the cards, so the same event
  // read one way in a row and another in the sheet.
  it.each([
    ['later today', '2026-07-20T19:00:00'],
    ['tomorrow', '2026-07-21T19:00:00'],
    ['three days out', '2026-07-23T19:00:00'],
    ['a week out', '2026-07-27T19:00:00'],
  ])('agrees with the card for %s', (_label, iso) => {
    const { dateShort } = splitEventTime(at(iso));
    expect(dateShort).toBe(eventDayLabel(at(iso)));
    expect(formatEventWhen(at(iso)).startsWith(dateShort)).toBe(true);
  });
});

describe('shortRelativeTime — the notification row’s timestamp', () => {
  it.each([
    ['under a minute', '2026-07-20T11:59:30', 'Just now'],
    ['two minutes', '2026-07-20T11:58:00', '2m ago'],
    ['the last minute before the hour rolls', '2026-07-20T11:01:00', '59m ago'],
    ['an hour exactly', '2026-07-20T11:00:00', '1h ago'],
    ['five hours', '2026-07-20T07:00:00', '5h ago'],
    ['just under a day', '2026-07-19T12:30:00', '23h ago'],
    ['a day', '2026-07-19T12:00:00', '1d ago'],
    ['six days, the last day-count', '2026-07-14T12:00:00', '6d ago'],
    ['a week', '2026-07-13T12:00:00', '1w ago'],
    // Past a month the count stops meaning anything without conversion, so the
    // ladder hands over to a date.
    ['five weeks out', '2026-06-15T12:00:00', 'Jun 15'],
  ])('%s reads "%s"', (_label, iso, expected) => {
    expect(shortRelativeTime(at(iso))).toBe(expected);
  });

  // Clock skew between the phone and the database can date a row a moment into
  // the future. "-1m ago" is worse than saying nothing happened yet.
  it('clamps a future timestamp rather than counting backwards', () => {
    expect(shortRelativeTime(at('2026-07-20T12:00:30'))).toBe('Just now');
  });
});

// The chat thread's divider chip. Backwards-looking, where eventDayLabel is
// forwards: a message from last Tuesday is "Tuesday", never "Completed".
describe('chatDayLabel', () => {
  it.each([
    ['this morning', '2026-07-20T09:00:00', 'Today'],
    ['yesterday', '2026-07-19T22:00:00', 'Yesterday'],
    ['earlier this week', '2026-07-16T13:00:00', 'Thursday'],
    // Past a week a weekday name could mean either of two, so it hands over
    // to a date — the same horizon the event ladder uses.
    ['a fortnight ago', '2026-07-06T13:00:00', 'Jul 6'],
  ])('%s reads "%s"', (_label, iso, expected) => {
    expect(chatDayLabel(at(iso))).toBe(expected);
  });
});

describe('startsNewDay', () => {
  it('divides before the first message', () => {
    expect(startsNewDay(undefined, at('2026-07-20T09:00:00'))).toBe(true);
  });

  it('does not divide two messages on the same day', () => {
    expect(
      startsNewDay(at('2026-07-20T09:00:00'), at('2026-07-20T23:30:00'))
    ).toBe(false);
  });

  it('divides across midnight', () => {
    expect(
      startsNewDay(at('2026-07-19T23:59:00'), at('2026-07-20T00:01:00'))
    ).toBe(true);
  });
});
