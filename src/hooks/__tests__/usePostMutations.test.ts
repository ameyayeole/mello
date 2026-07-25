import { QueryClient } from '@tanstack/react-query';
import { postMutations } from '../usePostMutations';
import { queryKeys } from '@/constants/queryKeys';
import * as svc from '@/services/community/posts.service';
import * as storage from '@/services/storage.service';
import { Profile } from '@/types/models';

jest.mock('@/services/community/posts.service');
jest.mock('@/services/storage.service');

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

  it('uploads media then creates a photo post when photos are attached', async () => {
    (storage.uploadPostPhotos as jest.Mock).mockResolvedValue(['http://a', 'http://b']);
    (svc.createPhotoPost as jest.Mock).mockResolvedValue('new2');
    const qc = new QueryClient();
    const { create } = postMutations(qc, user);

    await (create.mutationFn as any)({
      body: 'hi',
      visibility: 'friends',
      media: ['file://a', 'file://b'],
    });

    expect(storage.uploadPostPhotos).toHaveBeenCalledWith('u1', ['file://a', 'file://b']);
    expect(svc.createPhotoPost).toHaveBeenCalledWith({
      authorId: 'u1',
      body: 'hi',
      media: ['http://a', 'http://b'],
      visibility: 'friends',
      city: 'Mumbai',
    });
    expect(svc.createTextPost).not.toHaveBeenCalled();
  });

  it('creates a text post (no upload) when media is empty', async () => {
    (svc.createTextPost as jest.Mock).mockResolvedValue('new3');
    const qc = new QueryClient();
    const { create } = postMutations(qc, user);

    await (create.mutationFn as any)({ body: 'hi', visibility: 'friends', media: [] });

    expect(svc.createTextPost).toHaveBeenCalled();
    expect(storage.uploadPostPhotos).not.toHaveBeenCalled();
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
