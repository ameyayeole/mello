import { alpha } from '../color';

describe('alpha', () => {
  it('suffixes a 6-digit hex with the alpha byte', () => {
    expect(alpha('#F95B5B', 1)).toBe('#F95B5Bff');
    expect(alpha('#F95B5B', 0)).toBe('#F95B5B00');
    expect(alpha('#F95B5B', 0.5)).toBe('#F95B5B80');
  });

  it('pads a single-digit alpha byte so the string stays 9 chars', () => {
    // 0.02 * 255 = 5.1 -> "5", which without padding produces a 8-char string
    // that parses as a *different* colour rather than failing loudly.
    expect(alpha('#F95B5B', 0.02)).toBe('#F95B5B05');
  });

  it('accepts uppercase and lowercase hex', () => {
    expect(alpha('#abcdef', 1)).toBe('#abcdefff');
    expect(alpha('#ABCDEF', 1)).toBe('#ABCDEFff');
  });

  it('returns null for anything that is not a 6-digit hex', () => {
    // Callers fall back to the opaque colour on null, so shorthand and named
    // colours must not silently produce garbage.
    expect(alpha('#fff', 0.5)).toBeNull();
    expect(alpha('rgba(0,0,0,0.5)', 0.5)).toBeNull();
    expect(alpha('red', 0.5)).toBeNull();
    expect(alpha('#F95B5B80', 0.5)).toBeNull();
    expect(alpha('', 0.5)).toBeNull();
  });

  it('clamps out-of-range alpha instead of overflowing the byte', () => {
    expect(alpha('#F95B5B', 2)).toBe('#F95B5Bff');
    expect(alpha('#F95B5B', -1)).toBe('#F95B5B00');
  });
});
