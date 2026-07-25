import { QueryClient } from '@tanstack/react-query';
import { patchPostInFeed, likeMutations } from '../usePostInteractions';
import { queryKeys } from '@/constants/queryKeys';
import * as svc from '@/services/community/postLikes.service';
import { CommunityPost } from '@/types/models';

jest.mock('@/services/community/postLikes.service');

const post = (id: string, over: Partial<CommunityPost> = {}): CommunityPost => ({
  id,
  author_id: 'a',
  author_name: 'A',
  author_photo_url: null,
  type: 'text',
  visibility: 'public',
  body: 'x',
  media: [],
  ref_wrap_event_id: null,
  score: 0,
  city: 'Mumbai',
  like_count: 0,
  comment_count: 0,
  liked_by_me: false,
  comments_enabled: true,
  created_at: 't',
  ...over,
});

// react-query v5's mutation callbacks take a trailing MutationFunctionContext we
// don't exercise here — build a minimal one so the direct calls satisfy the arity.
const mfc = (qc: QueryClient) => ({ client: qc, meta: undefined });

beforeEach(() => jest.clearAllMocks());

describe('patchPostInFeed', () => {
  it('applies the patch to the matching post across pages and leaves others', () => {
    const pages = [[post('1'), post('2')], [post('3')]];
    const next = patchPostInFeed(pages, '2', (p) => ({
      ...p,
      liked_by_me: true,
      like_count: p.like_count + 1,
    }));
    expect(next[0][1]).toMatchObject({ id: '2', liked_by_me: true, like_count: 1 });
    expect(next[0][0]).toMatchObject({ id: '1', liked_by_me: false, like_count: 0 });
    expect(next[1][0]).toMatchObject({ id: '3', liked_by_me: false });
  });

  it('leaves the pages referentially stable where nothing changed', () => {
    const pageA = [post('1')];
    const pageB = [post('2')];
    const next = patchPostInFeed([pageA, pageB], '2', (p) => ({ ...p, like_count: 9 }));
    expect(next[0]).toBe(pageA); // untouched page keeps identity
    expect(next[1]).not.toBe(pageB); // patched page is a new array
  });
});

describe('likeMutations.toggle', () => {
  it('calls likePost when not yet liked', async () => {
    (svc.likePost as jest.Mock).mockResolvedValue(undefined);
    const qc = new QueryClient();
    const { toggle } = likeMutations(qc, 'u1');
    await toggle.mutationFn!({ postId: 'p1', liked: false }, mfc(qc));
    expect(svc.likePost).toHaveBeenCalledWith({ postId: 'p1', userId: 'u1' });
  });

  it('calls unlikePost when already liked', async () => {
    (svc.unlikePost as jest.Mock).mockResolvedValue(undefined);
    const qc = new QueryClient();
    const { toggle } = likeMutations(qc, 'u1');
    await toggle.mutationFn!({ postId: 'p1', liked: true }, mfc(qc));
    expect(svc.unlikePost).toHaveBeenCalledWith({ postId: 'p1', userId: 'u1' });
  });

  it('optimistically flips liked_by_me and like_count in the feed cache', async () => {
    const qc = new QueryClient();
    const key = queryKeys.community.feed.of('u1');
    qc.setQueryData(key, { pages: [[post('p1')]], pageParams: [null] });
    const { toggle } = likeMutations(qc, 'u1');

    await toggle.onMutate!({ postId: 'p1', liked: false }, mfc(qc));

    const data = qc.getQueryData(key) as { pages: CommunityPost[][] };
    expect(data.pages[0][0]).toMatchObject({ liked_by_me: true, like_count: 1 });
  });

  it('optimistically un-likes, flooring the count at 0', async () => {
    const qc = new QueryClient();
    const key = queryKeys.community.feed.of('u1');
    qc.setQueryData(key, {
      pages: [[post('p1', { liked_by_me: true, like_count: 1 })]],
      pageParams: [null],
    });
    const { toggle } = likeMutations(qc, 'u1');

    await toggle.onMutate!({ postId: 'p1', liked: true }, mfc(qc));

    const data = qc.getQueryData(key) as { pages: CommunityPost[][] };
    expect(data.pages[0][0]).toMatchObject({ liked_by_me: false, like_count: 0 });
  });

  it('rolls back the cache on error', async () => {
    const qc = new QueryClient();
    const key = queryKeys.community.feed.of('u1');
    qc.setQueryData(key, { pages: [[post('p1')]], pageParams: [null] });
    const { toggle } = likeMutations(qc, 'u1');

    const ctx = await toggle.onMutate!({ postId: 'p1', liked: false }, mfc(qc));
    toggle.onError!(new Error('x'), { postId: 'p1', liked: false }, ctx, mfc(qc));

    const data = qc.getQueryData(key) as { pages: CommunityPost[][] };
    expect(data.pages[0][0]).toMatchObject({ liked_by_me: false, like_count: 0 });
  });
});
