import { errorMessage, errorProp } from '../errors';

const FALLBACK = 'Something went wrong. Please try again.';

describe('errorMessage', () => {
  it('reads Error.message', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('reads a bare string, which a rejected fetch can surface', () => {
    expect(errorMessage('offline')).toBe('offline');
  });

  it('reads .message off a plain object, which is what PostgrestError is', () => {
    // Supabase throws a plain object, not an Error, so `instanceof` misses it.
    expect(errorMessage({ message: 'row not found', code: 'PGRST116' })).toBe(
      'row not found'
    );
  });

  // The whole reason this helper exists: `catch (e: any) { alert(e.message) }`
  // showed users a literally empty alert whenever the thrown value carried no
  // message — exactly when they most need to be told something.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty Error', new Error('')],
    ['a whitespace-only Error', new Error('   ')],
    ['an empty string', ''],
    ['an object with no message', { code: 500 }],
    ['an object with a non-string message', { message: 42 }],
  ])('falls back rather than showing nothing for %s', (_label, thrown) => {
    expect(errorMessage(thrown)).toBe(FALLBACK);
  });

  it('accepts a caller-supplied fallback', () => {
    expect(errorMessage(null, 'Photo not sent')).toBe('Photo not sent');
  });
});

describe('errorProp', () => {
  it('reads a string property off an unknown thrown value', () => {
    expect(errorProp({ name: 'AbortError' }, 'name')).toBe('AbortError');
  });

  it('returns undefined when the property is absent or not a string', () => {
    expect(errorProp({ name: 'AbortError' }, 'code')).toBeUndefined();
    expect(errorProp({ code: 42 }, 'code')).toBeUndefined();
    expect(errorProp(null, 'code')).toBeUndefined();
    expect(errorProp('a string', 'code')).toBeUndefined();
  });
});
