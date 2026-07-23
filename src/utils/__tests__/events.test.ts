import {
  splitByWhen,
  featuredHostedEvent,
  eventImageUri,
} from '../events';

// wrap.service is pure date maths, but it imports the Supabase client at module
// scope. Stub the client so requiring it in a unit test doesn't open a network
// stack — nothing here touches it.
jest.mock('@/services/supabase', () => ({ supabase: { from: jest.fn() } }));

const NOW = new Date('2026-07-21T12:00:00.000Z');

function at(iso: string, ends: string | null = null) {
  return { id: iso, starts_at: iso, ends_at: ends };
}

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterAll(() => jest.useRealTimers());

describe('splitByWhen', () => {
  it('splits on the end time, not the start time', () => {
    // Started two hours ago, runs for another two: you are *at* this event.
    const inProgress = at('2026-07-21T10:00:00.000Z', '2026-07-21T14:00:00.000Z');
    const { upcoming, attended } = splitByWhen([inProgress]);

    expect(upcoming).toEqual([inProgress]);
    expect(attended).toEqual([]);
  });

  it('treats a missing end time as four hours after the start', () => {
    // The wrapEndAt default. Three hours in is still running; five is over.
    const running = at('2026-07-21T09:00:00.000Z');
    const finished = at('2026-07-21T07:00:00.000Z');

    expect(splitByWhen([running]).upcoming).toEqual([running]);
    expect(splitByWhen([finished]).attended).toEqual([finished]);
  });

  it('orders upcoming soonest-first and attended most-recent-first', () => {
    const soon = at('2026-07-22T12:00:00.000Z');
    const later = at('2026-07-25T12:00:00.000Z');
    const yesterday = at('2026-07-20T12:00:00.000Z');
    const lastWeek = at('2026-07-14T12:00:00.000Z');

    const { upcoming, attended } = splitByWhen([later, lastWeek, soon, yesterday]);

    expect(upcoming).toEqual([soon, later]);
    expect(attended).toEqual([yesterday, lastWeek]);
  });

  it('does not mutate the caller array', () => {
    const rows = [at('2026-07-25T12:00:00.000Z'), at('2026-07-22T12:00:00.000Z')];
    const before = [...rows];
    splitByWhen(rows);
    expect(rows).toEqual(before);
  });
});

describe('featuredHostedEvent', () => {
  it('prefers the soonest event still to come', () => {
    const soon = at('2026-07-22T12:00:00.000Z');
    const later = at('2026-07-25T12:00:00.000Z');
    const past = at('2026-07-20T12:00:00.000Z');

    expect(featuredHostedEvent([past, soon, later])).toBe(soon);
  });

  it('falls back to the most recently finished one, so the wrap stays reachable', () => {
    const lastWeek = at('2026-07-14T12:00:00.000Z');
    const yesterday = at('2026-07-20T12:00:00.000Z');

    // This is the case that was on screen: three hosted events, all over.
    expect(featuredHostedEvent([lastWeek, yesterday])).toBe(yesterday);
  });

  it('picks the latest *ending* event, not the last one to start', () => {
    // A long event that began first can still outlast a short later one.
    const longRun = at('2026-07-19T12:00:00.000Z', '2026-07-21T09:00:00.000Z');
    const shortLater = at('2026-07-20T12:00:00.000Z', '2026-07-20T13:00:00.000Z');

    expect(featuredHostedEvent([longRun, shortLater])).toBe(longRun);
  });

  it('returns null when there is nothing at all', () => {
    expect(featuredHostedEvent([])).toBeNull();
  });
});

describe('eventImageUri', () => {
  it('prefers the event photo', () => {
    expect(
      eventImageUri({ image_url: 'event.jpg', host_photo_url: 'host.jpg' })
    ).toBe('event.jpg');
  });

  it('falls back to the host photo when the event has none', () => {
    expect(
      eventImageUri({ image_url: null, host_photo_url: 'host.jpg' })
    ).toBe('host.jpg');
    expect(eventImageUri({ host_photo_url: 'host.jpg' })).toBe('host.jpg');
  });

  it('returns null when neither exists, so callers draw the glyph', () => {
    expect(eventImageUri({ image_url: null, host_photo_url: null })).toBeNull();
    expect(eventImageUri({})).toBeNull();
  });

  it('treats an empty string as absent', () => {
    // A failed upload can leave '' rather than null, and expo-image renders a
    // broken frame for it rather than falling through — so `||`, not `??`.
    expect(eventImageUri({ image_url: '', host_photo_url: 'host.jpg' })).toBe(
      'host.jpg'
    );
    expect(eventImageUri({ image_url: '', host_photo_url: '' })).toBeNull();
  });
});
