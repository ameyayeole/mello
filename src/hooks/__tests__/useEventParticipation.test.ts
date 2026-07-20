import { Alert } from 'react-native';
import { QueryClient, MutationObserver } from '@tanstack/react-query';
import { participationMutations } from '../useEventParticipation';
import { queryKeys } from '@/constants/queryKeys';
import {
  joinEvent,
  leaveEvent,
  approveParticipant,
  rejectParticipant,
} from '@/services/events.service';
import { EventDetail, Profile } from '@/types/models';

jest.mock('@/services/events.service');
jest.mock('@/services/reminders', () => ({
  scheduleEventSafetyReminder: jest.fn(),
  cancelEventSafetyReminder: jest.fn(),
}));
// Spy rather than jest.mock('react-native'): replacing the whole module breaks
// expo-modules-core, which the service layer pulls in transitively.
jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const EVENT_ID = 'e1';
const me = { id: 'me', name: 'Me' } as Profile;
const other = (id: string, status: string) => ({ id, name: id, status });

function makeEvent(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: EVENT_ID,
    requires_approval: false,
    participants: [other('a', 'approved'), other('b', 'pending')],
    participant_count: 1,
    ...overrides,
  } as unknown as EventDetail;
}

// Drives one mutation the way React Query would, without a renderer.
async function run<TVars>(
  qc: QueryClient,
  options: object,
  vars?: TVars
): Promise<void> {
  const observer = new MutationObserver(qc, options as never);
  try {
    await observer.mutate(vars as never);
  } catch {
    // Rejections are the point of the rollback cases; the assertions read the
    // cache afterwards rather than the thrown value.
  }
}

function setup(event = makeEvent()) {
  const qc = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      // gcTime Infinity so the cache never schedules its garbage-collection
      // timer. The default 5 minutes leaves a live handle per test and Jest
      // then refuses to exit — harmless locally, hangs a CI job.
      queries: { retry: false, gcTime: Infinity },
    },
  });
  qc.setQueryData(queryKeys.eventDetail.of(EVENT_ID), event);
  const m = participationMutations(qc, EVENT_ID, me, event);
  const detail = () =>
    qc.getQueryData<EventDetail>(queryKeys.eventDetail.of(EVENT_ID))!;
  return { qc, m, detail };
}

beforeEach(() => jest.clearAllMocks());

describe('optimistic writes', () => {
  it('adds me as approved when no approval is required', async () => {
    (joinEvent as jest.Mock).mockResolvedValue(undefined);
    const { qc, m, detail } = setup();

    await run(qc, m.join);

    expect(detail().participants.find((p) => p.id === 'me')?.status).toBe(
      'approved'
    );
    // Recomputed from the roster rather than incremented: 'a' + me.
    expect(detail().participant_count).toBe(2);
  });

  it('adds me as pending, and not to the count, when approval is required', async () => {
    (joinEvent as jest.Mock).mockResolvedValue(undefined);
    const { qc, m, detail } = setup(makeEvent({ requires_approval: true }));

    await run(qc, m.join);

    expect(detail().participants.find((p) => p.id === 'me')?.status).toBe(
      'pending'
    );
    expect(detail().participant_count).toBe(1);
  });

  it('removes me on leave', async () => {
    (leaveEvent as jest.Mock).mockResolvedValue(undefined);
    const { qc, m, detail } = setup(
      makeEvent({
        participants: [other('a', 'approved'), { ...me, status: 'approved' }],
        participant_count: 2,
      } as Partial<EventDetail>)
    );

    await run(qc, m.leave);

    expect(detail().participants.some((p) => p.id === 'me')).toBe(false);
    expect(detail().participant_count).toBe(1);
  });

  it('promotes a pending participant on approve', async () => {
    (approveParticipant as jest.Mock).mockResolvedValue(undefined);
    const { qc, m, detail } = setup();

    await run(qc, m.approve, 'b');

    expect(detail().participants.find((p) => p.id === 'b')?.status).toBe(
      'approved'
    );
    expect(detail().participant_count).toBe(2);
  });

  it('drops the participant entirely on reject', async () => {
    (rejectParticipant as jest.Mock).mockResolvedValue(undefined);
    const { qc, m, detail } = setup();

    await run(qc, m.reject, 'b');

    expect(detail().participants.some((p) => p.id === 'b')).toBe(false);
    expect(detail().participant_count).toBe(1);
  });
});

describe('rollback', () => {
  // Without this the UI keeps a lie: the button reads "Going" for an event the
  // server refused.
  it.each([
    ['join', joinEvent, 'join', undefined],
    ['leave', leaveEvent, 'leave', undefined],
    ['approve', approveParticipant, 'approve', 'b'],
    ['reject', rejectParticipant, 'reject', 'b'],
  ])('%s restores the snapshot when the request fails', async (
    _label,
    service,
    key,
    vars
  ) => {
    (service as jest.Mock).mockRejectedValue(new Error('offline'));
    const { qc, m, detail } = setup();
    const before = structuredClone(detail());

    await run(qc, m[key as keyof typeof m], vars);

    expect(detail()).toEqual(before);
  });
});

describe('in-flight refetches', () => {
  // The defect this hook was extracted to fix. The four mutations used to
  // snapshot without cancelling first, so a refetch already on the wire could
  // resolve after the optimistic write and overwrite it — Join flipped to
  // "Going" and then snapped back on a slow connection.
  it.each(['join', 'leave', 'approve', 'reject'])(
    '%s cancels in-flight queries before writing optimistically',
    async (key) => {
      (joinEvent as jest.Mock).mockResolvedValue(undefined);
      (leaveEvent as jest.Mock).mockResolvedValue(undefined);
      (approveParticipant as jest.Mock).mockResolvedValue(undefined);
      (rejectParticipant as jest.Mock).mockResolvedValue(undefined);
      const { qc, m } = setup();
      const cancel = jest.spyOn(qc, 'cancelQueries');

      await run(qc, m[key as keyof typeof m], 'b');

      expect(cancel).toHaveBeenCalledWith({
        queryKey: queryKeys.eventDetail.of(EVENT_ID),
      });
    }
  );
});

describe('settling', () => {
  it('invalidates the detail query so the optimistic guess reconciles', async () => {
    (joinEvent as jest.Mock).mockResolvedValue(undefined);
    const { qc, m } = setup();
    const invalidate = jest.spyOn(qc, 'invalidateQueries');

    await run(qc, m.join);

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.eventDetail.of(EVENT_ID),
    });
  });
});
