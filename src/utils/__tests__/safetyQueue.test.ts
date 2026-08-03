import {
  buildSafetyQueue,
  confirmSafetyQueue,
  dismissSafetyQueue,
} from '../safetyQueue';
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

describe('buildSafetyQueue', () => {
  it('produces the full queue, first_join first, when nothing has been seen', () => {
    const recent = new Date().toISOString();
    const event = ev({
      women_only: true,
      activity: 'drinks',
      host: { created_at: recent },
    } as Partial<EventDetail>);
    const queue = buildSafetyQueue(event, new Set());
    expect(queue.map((p) => p.flag)).toEqual([
      'first_join',
      'women_event.e1',
      'new_host.host',
      'party.e1',
    ]);
  });

  it('filters out flags already seen', () => {
    const event = ev({ women_only: true });
    const queue = buildSafetyQueue(
      event,
      new Set(['first_join', 'women_event.e1'])
    );
    expect(queue).toEqual([]);
  });

  // No unseen flags at all → the caller's cue to join immediately, no popup.
  it('is empty for a plain event with every flag already seen', () => {
    const queue = buildSafetyQueue(ev(), new Set(['first_join']));
    expect(queue).toEqual([]);
  });
});

describe('confirmSafetyQueue', () => {
  it('marks only the head seen and pops it, joining only once empty', () => {
    const event = ev({ women_only: true });
    let queue = buildSafetyQueue(event, new Set());
    expect(queue).toHaveLength(2);

    // First confirm: pops first_join, the women-only popup remains, no join.
    let step = confirmSafetyQueue(queue);
    expect(step.seenFlag).toBe('first_join');
    expect(step.queue.map((p) => p.flag)).toEqual(['women_event.e1']);
    expect(step.join).toBe(false);
    queue = step.queue;

    // Second confirm: pops the last one, queue empties, join fires.
    step = confirmSafetyQueue(queue);
    expect(step.seenFlag).toBe('women_event.e1');
    expect(step.queue).toEqual([]);
    expect(step.join).toBe(true);
  });

  it('never reports join before the queue is actually empty', () => {
    const event = ev({ women_only: true, activity: 'drinks' });
    const queue = buildSafetyQueue(event, new Set());
    expect(queue.length).toBeGreaterThan(2);
    for (let i = 0; i < queue.length - 1; i++) {
      expect(confirmSafetyQueue(queue.slice(i)).join).toBe(false);
    }
    expect(confirmSafetyQueue(queue.slice(-1)).join).toBe(true);
  });
});

describe('dismissSafetyQueue', () => {
  it('clears the queue and never fires a join', () => {
    expect(dismissSafetyQueue()).toEqual({
      seenFlag: null,
      queue: [],
      join: false,
    });
  });
});
