import { rankMentionables } from '@/services/community/mentions.service';
import { Profile } from '@/types/models';

const p = (username: string, name = username): Profile =>
  ({ id: username, username, name, photo_url: null } as Profile);

describe('rankMentionables', () => {
  it('puts username-prefix matches ahead of name-only matches', () => {
    // "al": alex matches by username; "Val" only by name.
    const ranked = rankMentionables([p('val', 'Alan'), p('alex', 'Alex')], 'al');
    expect(ranked.map((r) => r.username)).toEqual(['alex', 'val']);
  });

  it('breaks ties alphabetically by username', () => {
    const ranked = rankMentionables([p('alice'), p('alan'), p('alex')], 'al');
    expect(ranked.map((r) => r.username)).toEqual(['alan', 'alex', 'alice']);
  });

  it('strips a leading @ from the query', () => {
    const ranked = rankMentionables([p('bea'), p('alex')], '@al');
    expect(ranked[0].username).toBe('alex');
  });

  it('does not mutate the input array', () => {
    const input = [p('bea'), p('alex')];
    rankMentionables(input, 'al');
    expect(input.map((r) => r.username)).toEqual(['bea', 'alex']);
  });
});
