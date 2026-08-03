import { joinGate, safetyFlagsFor } from '../eventCardGates';
import { EventDetail } from '@/types/models';

const base = {
  id: 'e1',
  host_id: 'host',
  activity: 'padel',
  requires_approval: false,
  participant_count: 2,
  max_people: null,
  women_only: false,
  host: { created_at: '2020-01-01T00:00:00Z' },
} as unknown as EventDetail;

const ev = (o: Partial<EventDetail> = {}) => ({ ...base, ...o }) as EventDetail;

describe('joinGate', () => {
  const args = {
    event: ev(),
    isHost: false,
    isParticipant: false,
    isPending: false,
    premium: false,
    distanceM: null as number | null,
    viewerGender: 'female' as string | undefined,
  };

  it('offers a plain join by default', () => {
    expect(joinGate(args)).toBe('join');
  });

  it('offers a request when the event needs approval', () => {
    expect(joinGate({ ...args, event: ev({ requires_approval: true }) })).toBe(
      'request'
    );
  });

  it('reports a pending request', () => {
    expect(joinGate({ ...args, isPending: true })).toBe('pending');
  });

  it('reports a full event', () => {
    expect(
      joinGate({ ...args, event: ev({ max_people: 2, participant_count: 2 }) })
    ).toBe('full');
  });

  it('locks a women-only event for a non-female viewer', () => {
    expect(
      joinGate({ ...args, event: ev({ women_only: true }), viewerGender: 'male' })
    ).toBe('womenOnly');
  });

  it('does not lock a women-only event for its host', () => {
    expect(
      joinGate({
        ...args,
        event: ev({ women_only: true }),
        viewerGender: 'male',
        isHost: true,
      })
    ).toBe('none');
  });

  it('gates a distant event behind Mello+ for a free user', () => {
    expect(joinGate({ ...args, distanceM: 50_000 })).toBe('premiumDistance');
  });

  it('does not gate distance for a premium user', () => {
    expect(joinGate({ ...args, distanceM: 50_000, premium: true })).toBe('join');
  });

  // A pending request must still be cancellable from a distance — the gate is
  // on joining, not on getting out.
  it('reports pending even when far away', () => {
    expect(joinGate({ ...args, distanceM: 50_000, isPending: true })).toBe(
      'pending'
    );
  });

  it('has no join action for someone already in, or for the host', () => {
    expect(joinGate({ ...args, isParticipant: true })).toBe('none');
    expect(joinGate({ ...args, isHost: true })).toBe('none');
  });
});

describe('safetyFlagsFor', () => {
  it('always includes the first-join flag', () => {
    expect(safetyFlagsFor(ev())).toContain('first_join');
  });

  it('adds the women-only flag, scoped to the event', () => {
    expect(safetyFlagsFor(ev({ women_only: true }))).toContain(
      'women_event.e1'
    );
  });

  it('adds the new-host flag, scoped to the host', () => {
    const recent = new Date().toISOString();
    expect(
      safetyFlagsFor(ev({ host: { created_at: recent } } as Partial<EventDetail>))
    ).toContain('new_host.host');
  });

  it('adds the party flag for a party activity, scoped to the event', () => {
    expect(safetyFlagsFor(ev({ activity: 'drinks' }))).toContain('party.e1');
  });

  it('orders first_join before the rest', () => {
    const flags = safetyFlagsFor(ev({ women_only: true, activity: 'drinks' }));
    expect(flags[0]).toBe('first_join');
  });
});
