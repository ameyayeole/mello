import { QueryClient } from '@tanstack/react-query';
import { postMutations } from '../usePostMutations';
import { queryKeys } from '@/constants/queryKeys';
import * as svc from '@/services/community/posts.service';
import { Profile } from '@/types/models';

jest.mock('@/services/community/posts.service');

const user = { id: 'u1', city: 'Mumbai' } as unknown as Profile;

beforeEach(() => jest.clearAllMocks());

describe('postMutations.create', () => {
  it('calls createTextPost with the author, city and payload', async () => {
    (svc.createTextPost as jest.Mock).mockResolvedValue('new1');
    const qc = new QueryClient();
    const { create } = postMutations(qc, user);

    await (create.mutationFn as any)({ body: 'hello', visibility: 'public' });

    expect(svc.createTextPost).toHaveBeenCalledWith({
      authorId: 'u1',
      body: 'hello',
      visibility: 'public',
      city: 'Mumbai',
    });
  });

  it('invalidates the community feed on success', async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { create } = postMutations(qc, user);

    (create.onSuccess as any)('new1', {}, undefined, {});

    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.community.feed.all });
  });
});

describe('postMutations.remove', () => {
  it('calls deletePost with the id', async () => {
    (svc.deletePost as jest.Mock).mockResolvedValue(undefined);
    const qc = new QueryClient();
    const { remove } = postMutations(qc, user);

    await (remove.mutationFn as any)('p9');

    expect(svc.deletePost).toHaveBeenCalledWith('p9');
  });
});
