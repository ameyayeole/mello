import { QueryClient } from '@tanstack/react-query';
import {
  commentMutations,
  patchCommentLike,
  commentLikeMutations,
} from '../useComments';
import { queryKeys } from '@/constants/queryKeys';
import * as svc from '@/services/community/comments.service';
import * as likeSvc from '@/services/community/commentLikes.service';
import { Profile, PostComment } from '@/types/models';

jest.mock('@/services/community/comments.service');
jest.mock('@/services/community/commentLikes.service');

// react-query v5 mutation callbacks take a trailing MutationFunctionContext.
const mfc = (qc: QueryClient) => ({ client: qc, meta: undefined });
const user = { id: 'u1' } as Profile;

const comment = (id: string, over: Partial<PostComment> = {}): PostComment => ({
  id,
  author_id: 'a',
  author_name: 'A',
  author_username: 'a',
  author_photo_url: null,
  body: 'x',
  mentions: [],
  like_count: 0,
  deleted: false,
  liked_by_me: false,
  created_at: 't',
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('commentMutations.add', () => {
  it('adds a comment with author + parent', async () => {
    (svc.addComment as jest.Mock).mockResolvedValue('c9');
    const qc = new QueryClient();
    const { add } = commentMutations(qc, 'p1', user);
    await add.mutationFn!({ body: 'hi', parentId: null }, mfc(qc));
    expect(svc.addComment).toHaveBeenCalledWith({
      postId: 'p1',
      authorId: 'u1',
      body: 'hi',
      parentId: null,
    });
  });

  it('invalidates the thread on success', () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { add } = commentMutations(qc, 'p1', user);
    add.onSuccess!('c9', { body: 'hi', parentId: null }, undefined as never, mfc(qc));
    expect(spy).toHaveBeenCalledWith({
      queryKey: queryKeys.community.comments.of('p1'),
    });
  });
});

describe('commentMutations.remove', () => {
  it('deletes with the hasReplies flag', async () => {
    (svc.deleteComment as jest.Mock).mockResolvedValue(undefined);
    const qc = new QueryClient();
    const { remove } = commentMutations(qc, 'p1', user);
    await remove.mutationFn!({ commentId: 'c1', hasReplies: true }, mfc(qc));
    expect(svc.deleteComment).toHaveBeenCalledWith({
      commentId: 'c1',
      hasReplies: true,
    });
  });
});

describe('patchCommentLike', () => {
  it('flips liked_by_me and moves like_count for the target only', () => {
    const list = [comment('c1'), comment('c2', { like_count: 3, liked_by_me: true })];
    const next = patchCommentLike(list, 'c1', false);
    expect(next![0]).toMatchObject({ id: 'c1', liked_by_me: true, like_count: 1 });
    expect(next![1]).toMatchObject({ id: 'c2', liked_by_me: true, like_count: 3 });
  });

  it('floors the count at 0 on unlike', () => {
    const next = patchCommentLike(
      [comment('c1', { liked_by_me: true, like_count: 1 })],
      'c1',
      true
    );
    expect(next![0]).toMatchObject({ liked_by_me: false, like_count: 0 });
  });
});

describe('commentLikeMutations.toggle', () => {
  it('routes to likeComment / unlikeComment', async () => {
    (likeSvc.likeComment as jest.Mock).mockResolvedValue(undefined);
    (likeSvc.unlikeComment as jest.Mock).mockResolvedValue(undefined);
    const qc = new QueryClient();
    const { toggle } = commentLikeMutations(qc, 'p1', 'u1');
    await toggle.mutationFn!({ commentId: 'c1', parentId: null, liked: false }, mfc(qc));
    expect(likeSvc.likeComment).toHaveBeenCalledWith({ commentId: 'c1', userId: 'u1' });
    await toggle.mutationFn!({ commentId: 'c1', parentId: null, liked: true }, mfc(qc));
    expect(likeSvc.unlikeComment).toHaveBeenCalledWith({ commentId: 'c1', userId: 'u1' });
  });

  it('optimistically patches the top-level comments cache', async () => {
    const qc = new QueryClient();
    const key = queryKeys.community.comments.of('p1');
    qc.setQueryData(key, [comment('c1')]);
    const { toggle } = commentLikeMutations(qc, 'p1', 'u1');
    await toggle.onMutate!({ commentId: 'c1', parentId: null, liked: false }, mfc(qc));
    const data = qc.getQueryData(key) as PostComment[];
    expect(data[0]).toMatchObject({ liked_by_me: true, like_count: 1 });
  });

  it('patches the replies cache when a parentId is given', async () => {
    const qc = new QueryClient();
    const key = queryKeys.community.replies.of('c1');
    qc.setQueryData(key, [comment('r1')]);
    const { toggle } = commentLikeMutations(qc, 'p1', 'u1');
    await toggle.onMutate!({ commentId: 'r1', parentId: 'c1', liked: false }, mfc(qc));
    const data = qc.getQueryData(key) as PostComment[];
    expect(data[0]).toMatchObject({ id: 'r1', liked_by_me: true, like_count: 1 });
  });

  it('rolls back on error', async () => {
    const qc = new QueryClient();
    const key = queryKeys.community.comments.of('p1');
    qc.setQueryData(key, [comment('c1')]);
    const { toggle } = commentLikeMutations(qc, 'p1', 'u1');
    const ctx = await toggle.onMutate!(
      { commentId: 'c1', parentId: null, liked: false },
      mfc(qc)
    );
    toggle.onError!(new Error('x'), { commentId: 'c1', parentId: null, liked: false }, ctx, mfc(qc));
    const data = qc.getQueryData(key) as PostComment[];
    expect(data[0]).toMatchObject({ liked_by_me: false, like_count: 0 });
  });
});
