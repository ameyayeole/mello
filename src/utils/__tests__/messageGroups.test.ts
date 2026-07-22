import {
  runFlags,
  readersByMessage,
  RUN_GAP_MS,
  Groupable,
  Readable,
} from '../messageGroups';

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

  // The rule is a minute, deliberately — Instagram's feel, and the unit people
  // think in ("they sent that all at once"). It was five, which made runs long
  // enough that a single timestamp stopped describing them.
  it('groups a burst inside one minute', () => {
    expect(runFlags(msg('a', 0), msg('a', 45_000), undefined).isFirstOfRun).toBe(
      false
    );
  });

  it('starts a new group once a minute has passed', () => {
    expect(runFlags(msg('a', 0), msg('a', 90_000), undefined).isFirstOfRun).toBe(
      true
    );
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

describe('readersByMessage', () => {
  const ME = 'me';

  function mine(id: string, offsetMs: number, type = 'text'): Readable {
    return { id, sender_id: ME, created_at: at(offsetMs), type };
  }
  function theirs(id: string, sender: string, offsetMs: number): Readable {
    return { id, sender_id: sender, created_at: at(offsetMs), type: 'text' };
  }
  function at(offsetMs: number) {
    return new Date(T0 + offsetMs).toISOString();
  }

  it('parks each reader against the newest message they have read', () => {
    const thread = [mine('m1', 0), mine('m2', 1000), mine('m3', 2000)];
    const reads = new Map([
      ['ana', at(1500)], // has read m1 and m2
      ['bo', at(9000)], // has read everything
    ]);

    expect(readersByMessage(thread, reads, ME)).toEqual(
      new Map([
        ['m2', ['ana']],
        ['m3', ['bo']],
      ])
    );
  });

  it('stacks readers who are at the same message', () => {
    const thread = [mine('m1', 0)];
    const reads = new Map([
      ['ana', at(500)],
      ['bo', at(600)],
    ]);
    expect(readersByMessage(thread, reads, ME).get('m1')).toEqual(['ana', 'bo']);
  });

  it('never hangs a face on someone else’s message', () => {
    const thread = [theirs('t1', 'ana', 0), mine('m1', 1000)];
    const reads = new Map([['ana', at(5000)]]);
    const rail = readersByMessage(thread, reads, ME);
    expect(rail.has('t1')).toBe(false);
    expect(rail.get('m1')).toEqual(['ana']);
  });

  it('ignores your own watermark', () => {
    const thread = [mine('m1', 0)];
    const reads = new Map([[ME, at(5000)]]);
    expect(readersByMessage(thread, reads, ME).size).toBe(0);
  });

  it('shows nothing for a reader who has not reached any of your messages', () => {
    const thread = [mine('m1', 5000)];
    const reads = new Map([['ana', at(1000)]]);
    expect(readersByMessage(thread, reads, ME).size).toBe(0);
  });

  it('compares instants, not strings, across timestamp formats', () => {
    // Postgres hands back '+00:00'; an optimistic message is minted with 'Z'.
    const thread: Readable[] = [
      { id: 'm1', sender_id: ME, created_at: '2026-07-22T10:00:00.000Z' },
    ];
    const reads = new Map([['ana', '2026-07-22T10:00:01.123456+00:00']]);
    expect(readersByMessage(thread, reads, ME).get('m1')).toEqual(['ana']);
  });

  it('skips system notices when picking the message to sit under', () => {
    const thread = [mine('m1', 0), mine('sys', 1000, 'system')];
    const reads = new Map([['ana', at(9000)]]);
    expect(readersByMessage(thread, reads, ME)).toEqual(
      new Map([['m1', ['ana']]])
    );
  });

  it('returns nothing before the viewer is known', () => {
    const thread = [mine('m1', 0)];
    expect(
      readersByMessage(thread, new Map([['ana', at(5000)]]), undefined).size
    ).toBe(0);
  });
});
