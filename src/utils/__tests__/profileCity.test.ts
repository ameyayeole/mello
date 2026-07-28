import { nextProfileCity } from '../profileCity';

describe('nextProfileCity', () => {
  it('returns null when nothing resolved (null)', () => {
    expect(nextProfileCity(null, 'Austin')).toBeNull();
  });

  it('returns null when nothing resolved (undefined)', () => {
    expect(nextProfileCity(undefined, 'Austin')).toBeNull();
  });

  it('returns null when resolved is empty', () => {
    expect(nextProfileCity('', 'Austin')).toBeNull();
  });

  it('returns null when resolved is whitespace only', () => {
    expect(nextProfileCity('   ', 'Austin')).toBeNull();
  });

  it('returns null when resolved is the "Nearby" display fallback', () => {
    // useLocation falls back to 'Nearby' when geocoding fails to produce a
    // city/district/region. Writing that would give every user with flaky
    // geocoding the same fake city, and the feed's same-city rung matches on
    // string equality — they'd all become "local" to each other.
    expect(nextProfileCity('Nearby', null)).toBeNull();
  });

  it('returns null when resolved equals current (trimmed, case-insensitive)', () => {
    expect(nextProfileCity('Austin', 'Austin')).toBeNull();
    expect(nextProfileCity('  austin  ', 'Austin')).toBeNull();
    expect(nextProfileCity('AUSTIN', 'austin')).toBeNull();
  });

  it('returns the trimmed resolved city when current is null', () => {
    expect(nextProfileCity('  Austin  ', null)).toBe('Austin');
  });

  it('returns the trimmed resolved city when current is undefined', () => {
    expect(nextProfileCity('Austin', undefined)).toBe('Austin');
  });

  it('returns the resolved city (preserving its casing) when it differs from current', () => {
    expect(nextProfileCity('Austin', 'Dallas')).toBe('Austin');
  });

  it('preserves resolved casing when it differs from current', () => {
    expect(nextProfileCity('San Francisco', 'san jose')).toBe('San Francisco');
  });
});
