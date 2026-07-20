import { searchUsers } from '../friends.service';
import { supabase } from '../supabase';

// The Supabase client is a fluent builder — every call returns `this` until the
// chain is awaited. This stands in for it: each method records its arguments
// and returns the builder, and the builder itself is thenable so `await` on the
// chain resolves to whatever the test queued.
jest.mock('../supabase', () => ({ supabase: { from: jest.fn() } }));

type Result = { data: unknown; error: unknown };

function mockChain(results: Result[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  let next = 0;

  const builder: Record<string, unknown> = {
    then: (resolve: (r: Result) => unknown) =>
      Promise.resolve(results[Math.min(next++, results.length - 1)]).then(
        resolve
      ),
  };
  for (const m of ['select', 'or', 'ilike', 'limit', 'eq']) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    };
  }
  (supabase.from as jest.Mock).mockReturnValue(builder);
  return { calls, argsFor: (m: string) => calls.filter((c) => c.method === m) };
}

const profile = (id: string, name: string) => ({ id, name });

beforeEach(() => jest.clearAllMocks());

describe('searchUsers', () => {
  it('quotes the search term so PostgREST reads it as a literal', async () => {
    // The regression this guards: an unquoted term containing a comma was
    // parsed as two filter conditions and the request failed with HTTP 400.
    const { argsFor } = mockChain([{ data: [], error: null }]);

    await searchUsers('coffee, bandra');

    expect(argsFor('or')[0].args[0]).toBe(
      'name.ilike."%coffee, bandra%",username.ilike."%coffee, bandra%"'
    );
  });

  it('strips a leading @ from the query', async () => {
    const { argsFor } = mockChain([{ data: [], error: null }]);

    await searchUsers('@ada');

    expect(argsFor('or')[0].args[0]).toContain('"%ada%"');
    expect(argsFor('or')[0].args[0]).not.toContain('@');
  });

  it('retries name-only when the username column does not exist', async () => {
    // 42703 = undefined_column, i.e. migration 029 has not been applied.
    const { argsFor } = mockChain([
      { data: null, error: { code: '42703' } },
      { data: [profile('1', 'Ada')], error: null },
    ]);

    const results = await searchUsers('ada');

    expect(argsFor('ilike')).toHaveLength(1);
    expect(results).toHaveLength(1);
  });

  // This is the important one. The retry used to fire on *any* error, which
  // silently downgraded real failures into name-only results — and hid the
  // malformed-filter bug above for as long as it existed.
  it('does NOT retry on an unrelated error, it throws', async () => {
    const { argsFor } = mockChain([
      { data: null, error: { code: 'PGRST100', message: 'parse error' } },
    ]);

    await expect(searchUsers('ada')).rejects.toMatchObject({
      code: 'PGRST100',
    });
    expect(argsFor('ilike')).toHaveLength(0);
  });

  it('hides the current user and anyone they have blocked', async () => {
    mockChain([
      { data: [profile('me', 'Me'), profile('b', 'Blocked'), profile('ok', 'Ok')], error: null },
      { data: [{ blocked_id: 'b' }], error: null },
    ]);

    const results = await searchUsers('a', 'me');

    expect(results.map((p) => p.id)).toEqual(['ok']);
  });

  it('returns everyone when there is no current user to filter against', async () => {
    mockChain([{ data: [profile('a', 'A'), profile('b', 'B')], error: null }]);

    expect(await searchUsers('a')).toHaveLength(2);
  });
});
