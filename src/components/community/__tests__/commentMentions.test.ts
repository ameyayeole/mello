import { extractMentionUsernames } from '@/components/community/commentMentions';

const c = (body: string | null) => ({ body });

describe('extractMentionUsernames', () => {
  it('collects unique lowercase handles across bodies, sorted', () => {
    expect(
      extractMentionUsernames([c('hi @Bea and @alpha'), c('@bea again'), c(null)])
    ).toEqual(['alpha', 'bea']);
  });

  it('returns [] for no bodies or no mentions', () => {
    expect(extractMentionUsernames(undefined)).toEqual([]);
    expect(extractMentionUsernames([c('no handles here')])).toEqual([]);
  });

  it('ignores a bare @ with no handle', () => {
    expect(extractMentionUsernames([c('email me @ home')])).toEqual([]);
  });
});
