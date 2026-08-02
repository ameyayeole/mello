import {
  dayLabel,
  dayOptions,
  dayValueOf,
  minuteValueOf,
  timeOptions,
  DATE_WINDOW_DAYS,
  TIME_STEP_MIN,
} from '../eventSchedule';

// Local noon, so nothing here straddles a day boundary in whatever zone the
// suite runs in.
function at(y: number, m: number, d: number, h = 12, min = 0) {
  return new Date(y, m, d, h, min, 0, 0);
}

describe('dayLabel', () => {
  const today = at(2026, 7, 3);

  it('names the near days rather than dating them', () => {
    expect(dayLabel(at(2026, 7, 3), today)).toBe('Today');
    expect(dayLabel(at(2026, 7, 4), today)).toBe('Tomorrow');
  });

  // The times of day differ by 22 hours but the dates do not, so this has to
  // still read as Today — the label is about the day, not the instant.
  it('compares days, not instants', () => {
    expect(dayLabel(at(2026, 7, 3, 23, 30), at(2026, 7, 3, 1, 0))).toBe('Today');
  });

  it('dates anything further out', () => {
    const label = dayLabel(at(2026, 7, 10), today);
    expect(label).not.toBe('Today');
    expect(label).not.toBe('Tomorrow');
    expect(label).toMatch(/10/);
  });

  // A date in the past is not something the flow should reach, but the label
  // must not claim it is today if it does.
  it('does not call yesterday Today', () => {
    expect(dayLabel(at(2026, 7, 2), today)).not.toBe('Today');
  });
});

describe('dayOptions', () => {
  const now = at(2026, 7, 3, 9, 15);

  it('starts at today and runs the whole window', () => {
    const opts = dayOptions(now);
    expect(opts).toHaveLength(DATE_WINDOW_DAYS);
    expect(opts[0].label).toBe('Today');
    expect(opts[1].label).toBe('Tomorrow');
  });

  // Values are midnights, so a start time can be recombined with them without
  // the time of day the list was built at leaking in.
  it('carries midnight values, not the moment it was built', () => {
    const first = new Date(dayOptions(now)[0].value);
    expect(first.getHours()).toBe(0);
    expect(first.getMinutes()).toBe(0);
    expect(first.getSeconds()).toBe(0);
  });

  it('advances exactly one day per entry', () => {
    const opts = dayOptions(now);
    const a = new Date(opts[5].value);
    const b = new Date(opts[6].value);
    expect(b.getDate()).toBe(new Date(a.getTime() + 86_400_000).getDate());
  });

  // Built from `now` rather than at module load, so a session left open
  // overnight does not go on offering yesterday.
  it('re-bases on whatever now it is given', () => {
    const later = dayOptions(at(2026, 7, 10));
    expect(new Date(later[0].value).getDate()).toBe(10);
  });
});

describe('timeOptions', () => {
  it('covers the day at the step size', () => {
    const opts = timeOptions();
    expect(opts).toHaveLength((24 * 60) / TIME_STEP_MIN);
    expect(opts[0].value).toBe(0);
    expect(opts[1].value).toBe(TIME_STEP_MIN);
    expect(opts[opts.length - 1].value).toBe(24 * 60 - TIME_STEP_MIN);
  });

  it('labels midnight and noon the way a clock does', () => {
    const opts = timeOptions();
    expect(opts[0].label).toBe('12:00 AM');
    expect(opts.find((o) => o.value === 12 * 60)?.label).toBe('12:00 PM');
  });
});

describe('reading a Date back out for the wheels', () => {
  it('dayValueOf matches the option it should select', () => {
    const now = at(2026, 7, 3, 9, 15);
    const start = at(2026, 7, 5, 19, 30);
    const match = dayOptions(now).find((o) => o.value === dayValueOf(start));
    expect(match).toBeDefined();
  });

  it('minuteValueOf lands on a step', () => {
    expect(minuteValueOf(at(2026, 7, 3, 19, 0))).toBe(19 * 60);
    expect(minuteValueOf(at(2026, 7, 3, 19, 30))).toBe(19 * 60 + 30);
  });

  // A stored draft can hold any minute; it has to snap to a row the wheel
  // actually has, or the wheel opens on nothing.
  it('rounds an off-step minute to the nearest row', () => {
    expect(minuteValueOf(at(2026, 7, 3, 19, 7))).toBe(19 * 60);
    expect(minuteValueOf(at(2026, 7, 3, 19, 23))).toBe(19 * 60 + 30);
  });

  it('always resolves to a row the time wheel offers', () => {
    const values = new Set(timeOptions().map((o) => o.value));
    for (const m of [0, 7, 15, 22, 38, 59]) {
      expect(values.has(minuteValueOf(at(2026, 7, 3, 13, m)))).toBe(true);
    }
  });
});
