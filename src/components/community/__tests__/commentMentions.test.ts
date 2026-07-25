import { buildMentionables } from '@/components/community/commentMentions';
import { Profile, PostComment } from '@/types/models';

const friend = (over: Partial<Profile>): Profile =>
  ({ id: 'x', name: 'X', username: 'x', photo_url: null, ...over } as Profile);

const comment = (over: Partial<PostComment>): PostComment =>
  ({
    id: 'c',
    author_id: 'ca',
    author_name: 'C',
    author_username: 'c',
    author_photo_url: null,
    body: 'x',
    mentions: [],
    like_count: 0,
    deleted: false,
    liked_by_me: false,
    created_at: 't',
    ...over,
  } as PostComment);

describe('buildMentionables', () => {
  it('maps lowercase username → id from friends, thread authors, and self', () => {
    const map = buildMentionables(
      [friend({ id: 'f1', username: 'Alex' })],
      [comment({ author_id: 'c1', author_username: 'Bea' })],
      { id: 'me', username: 'Me' } as Profile
    );
    expect(map.get('alex')).toBe('f1');
    expect(map.get('bea')).toBe('c1');
    expect(map.get('me')).toBe('me');
  });

  it('skips entries without a username', () => {
    const map = buildMentionables(
      [friend({ id: 'f1', username: undefined })],
      [comment({ author_id: 'c1', author_username: '' })],
      null
    );
    expect(map.size).toBe(0);
  });
});
