import { clampVisibleLineCount } from '../textLines';

describe('clampVisibleLineCount', () => {
  it('returns the full count when everything fits', () => {
    expect(clampVisibleLineCount(200, 21, 5)).toBe(5);
  });

  it('floors to whole lines that fit the available height', () => {
    expect(clampVisibleLineCount(100, 21, 10)).toBe(4); // 100 / 21 = 4.76
  });

  it('never returns fewer than 1 line when there is at least one line and some room', () => {
    expect(clampVisibleLineCount(5, 21, 10)).toBe(1);
  });

  it('never exceeds the total line count', () => {
    expect(clampVisibleLineCount(1000, 21, 3)).toBe(3);
  });

  it('returns 0 when there are no lines to show', () => {
    expect(clampVisibleLineCount(200, 21, 0)).toBe(0);
  });

  it('returns 0 when available height is zero or negative', () => {
    expect(clampVisibleLineCount(0, 21, 5)).toBe(0);
    expect(clampVisibleLineCount(-40, 21, 5)).toBe(0);
  });
});
