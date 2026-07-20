import { ilikePattern } from '../postgrest';

// These exist because interpolating a raw search box into PostgREST's `.or()`
// filter grammar produced a live HTTP 400 on any query containing a comma.
describe('ilikePattern', () => {
  it('wraps the term so it is parsed as a literal, not as filter grammar', () => {
    expect(ilikePattern('coffee')).toBe('"%coffee%"');
  });

  it('survives a comma, which used to break the filter into two conditions', () => {
    expect(ilikePattern('coffee, bandra')).toBe('"%coffee, bandra%"');
  });

  it('escapes quotes so the term cannot close its own literal', () => {
    expect(ilikePattern('say "hi"')).toBe('"%say \\"hi\\"%"');
  });

  it('escapes backslashes before quotes, so an escaped quote cannot be faked', () => {
    // A naive implementation that escapes quotes first turns `\"` into `\\"`,
    // which PostgREST reads as an escaped backslash followed by a *closing*
    // quote — putting the rest of the input back into filter position.
    expect(ilikePattern('a\\"b')).toBe('"%a\\\\\\"b%"');
  });

  it('leaves the dot and parenthesis of the filter grammar inert', () => {
    expect(ilikePattern('name.eq.admin')).toBe('"%name.eq.admin%"');
    expect(ilikePattern('a)or(b')).toBe('"%a)or(b%"');
  });

  it('passes LIKE wildcards through, which is deliberate', () => {
    // Not escaped on purpose: someone typing "50%" getting wildcard behaviour
    // is reasonable for a search box, and is not a correctness problem.
    expect(ilikePattern('50%')).toBe('"%50%%"');
  });

  it('handles an empty term without producing a malformed pattern', () => {
    expect(ilikePattern('')).toBe('"%%"');
  });
});
