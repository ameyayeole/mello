import { runFlags, RUN_GAP_MS, Groupable } from '../messageGroups';

const T0 = new Date('2026-07-22T10:00:00.000Z').getTime();

function msg(
  sender: string,
  offsetMs = 0,
  type: string = 'text'
): Groupable {
  return {
    sender_id: sender,
    created_at: new Date(T0 + offsetMs).toISOString(),
    type,
  };
}

describe('runFlags', () => {
  it('treats a lone message as both ends of its run', () => {
    expect(runFlags(undefined, msg('a'), undefined)).toEqual({
      isFirstOfRun: true,
      isLastOfRun: true,
    });
  });

  it('collapses a burst from one sender into a single run', () => {
    const burst = [msg('a', 0), msg('a', 1000), msg('a', 2000)];
    const flags = burst.map((m, i) =>
      runFlags(burst[i - 1], m, burst[i + 1])
    );

    expect(flags[0]).toEqual({ isFirstOfRun: true, isLastOfRun: false });
    expect(flags[1]).toEqual({ isFirstOfRun: false, isLastOfRun: false });
    // The avatar hangs off this one.
    expect(flags[2]).toEqual({ isFirstOfRun: false, isLastOfRun: true });
  });

  it('breaks the run when the sender changes', () => {
    expect(runFlags(msg('a'), msg('b', 1000), msg('a', 2000))).toEqual({
      isFirstOfRun: true,
      isLastOfRun: true,
    });
  });

  it('breaks the run on a gap longer than RUN_GAP_MS', () => {
    const late = msg('a', RUN_GAP_MS + 1);
    expect(runFlags(msg('a'), late, undefined).isFirstOfRun).toBe(true);
  });

  it('keeps the run at exactly RUN_GAP_MS', () => {
    const edge = msg('a', RUN_GAP_MS);
    expect(runFlags(msg('a'), edge, undefined).isFirstOfRun).toBe(false);
  });

  it('splits a run around a system message', () => {
    const prev = msg('a', 0);
    const system = msg('a', 1000, 'system');
    const next = msg('a', 2000);
    expect(runFlags(prev, system, next)).toEqual({
      isFirstOfRun: true,
      isLastOfRun: true,
    });
    // ...and the message after it starts a fresh run rather than continuing.
    expect(runFlags(system, next, undefined).isFirstOfRun).toBe(true);
  });

  it('splits a run around a host announcement', () => {
    const announcement = msg('a', 1000, 'announcement');
    expect(runFlags(msg('a', 0), announcement, msg('a', 2000))).toEqual({
      isFirstOfRun: true,
      isLastOfRun: true,
    });
  });

  it('breaks the run rather than guessing when a timestamp is unparseable', () => {
    const broken: Groupable = { sender_id: 'a', created_at: 'not a date' };
    expect(runFlags(msg('a', 0), broken, undefined).isFirstOfRun).toBe(true);
  });
});
