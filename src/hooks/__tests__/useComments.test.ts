import { QueryClient } from '@tanstack/react-query';
import { commentMutations } from '../useComments';
import { queryKeys } from '@/constants/queryKeys';
import * as svc from '@/services/community/comments.service';
import { Profile } from '@/types/models';

jest.mock('@/services/community/comments.service');

// react-query v5 mutation callbacks take a trailing MutationFunctionContext.
const mfc = (qc: QueryClient) => ({ client: qc, meta: undefined });
const user = { id: 'u1' } as Profile;

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
