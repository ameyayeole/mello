import { nextCommunityCursor } from '../useCommunityFeed';
import { CommunityPost } from '@/types/models';

const post = (id: string, createdAt: string): CommunityPost => ({
  id,
  author_id: 'a',
  author_name: 'A',
  author_photo_url: null,
  type: 'text',
  visibility: 'public',
  body: 'x',
  media: [],
  ref_wrap_event_id: null,
  city: 'Mumbai',
  like_count: 0,
  comment_count: 0,
  liked_by_me: false,
  comments_enabled: true,
  created_at: createdAt,
});

describe('nextCommunityCursor', () => {
  it('returns undefined when the page is short (no more rows)', () => {
    expect(nextCommunityCursor([post('1', 't1')], 10)).toBeUndefined();
  });

  it('returns the last row as the cursor when the page is full', () => {
    const page = [post('1', 't1'), post('2', 't2')];
    expect(nextCommunityCursor(page, 2)).toEqual({ createdAt: 't2', id: '2' });
  });

  it('returns undefined for an empty page', () => {
    expect(nextCommunityCursor([], 10)).toBeUndefined();
  });
});
