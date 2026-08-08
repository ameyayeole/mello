import { isSafetyReason, DOWN_REASONS } from '../wrapRating';

describe('isSafetyReason', () => {
  it('treats discomfort as a safety signal', () => {
    expect(isSafetyReason('uncomfortable')).toBe(true);
  });

  it('treats a no-show as a safety signal', () => {
    expect(isSafetyReason('no_show')).toBe(true);
  });

  it('treats taste as a preference, not a report', () => {
    expect(isSafetyReason('not_my_vibe')).toBe(false);
  });

  it('offers exactly three reasons', () => {
    expect(DOWN_REASONS).toHaveLength(3);
  });

  it('every reason is classified', () => {
    for (const r of DOWN_REASONS) {
      expect(typeof isSafetyReason(r.id)).toBe('boolean');
    }
  });
});
