import { neighbourhood, shortLocation } from '../location';

describe('shortLocation', () => {
  it('keeps the first meaningful, non-repeated part', () => {
    expect(shortLocation('226, Halav Pool, Halav Pool, Mumbai')).toBe(
      'Halav Pool'
    );
  });
});

describe('neighbourhood', () => {
  it('skips the street line and returns the area', () => {
    expect(neighbourhood('801 Jessie St, Kalyan Nagar, Bengaluru')).toBe(
      'Kalyan Nagar'
    );
  });

  it('skips a numbered street name like "1st Main"', () => {
    expect(neighbourhood('1st Main, Indiranagar, Bengaluru')).toBe(
      'Indiranagar'
    );
  });

  it('returns an area that is already first', () => {
    expect(neighbourhood('Kalyan Nagar, Bengaluru')).toBe('Kalyan Nagar');
  });

  it('passes a bare place name through', () => {
    expect(neighbourhood('Cubbon Park')).toBe('Cubbon Park');
  });

  it('falls back to shortLocation when every part is a street', () => {
    expect(neighbourhood('801 Jessie St')).toBe('801 Jessie St');
  });
});
