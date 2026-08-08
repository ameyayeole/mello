import { shouldDealWrap } from '../wrapDeal';

const a = (o: Partial<Parameters<typeof shouldDealWrap>[0]> = {}) => ({
  hoursSinceEnd: 2,
  alreadyDealt: false,
  hasContributed: false,
  ...o,
});

describe('shouldDealWrap', () => {
  it('deals just after the event ends', () => {
    expect(shouldDealWrap(a())).toBe(true);
  });

  it('never deals twice', () => {
    expect(shouldDealWrap(a({ alreadyDealt: true }))).toBe(false);
  });

  it('does not deal to someone who already contributed', () => {
    expect(shouldDealWrap(a({ hasContributed: true }))).toBe(false);
  });

  it('does not deal before the event has ended', () => {
    expect(shouldDealWrap(a({ hoursSinceEnd: -3 }))).toBe(false);
  });

  it('still deals at the edge of the window', () => {
    expect(shouldDealWrap(a({ hoursSinceEnd: 47 }))).toBe(true);
  });

  it('stops dealing once the window has closed', () => {
    expect(shouldDealWrap(a({ hoursSinceEnd: 49 }))).toBe(false);
  });
});
