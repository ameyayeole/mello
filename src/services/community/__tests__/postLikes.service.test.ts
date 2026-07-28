import { likePost, unlikePost } from '../postLikes.service';
import { supabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({
  supabase: { from: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

describe('likePost', () => {
  it('inserts a (post_id, user_id) row', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ insert });
    await likePost({ postId: 'p1', userId: 'u1' });
    expect(supabase.from).toHaveBeenCalledWith('post_likes');
    expect(insert).toHaveBeenCalledWith({ post_id: 'p1', user_id: 'u1' });
  });

  it('throws on error', async () => {
    const insert = jest.fn().mockResolvedValue({ error: { message: 'x' } });
    (supabase.from as jest.Mock).mockReturnValue({ insert });
    await expect(likePost({ postId: 'p1', userId: 'u1' })).rejects.toBeTruthy();
  });
});

describe('unlikePost', () => {
  // The service chains exactly two .eq() calls: the awaited value is the SECOND
  // eq's return, so that is where {error} must live.
  it('deletes the matching row by post and user', async () => {
    const eq2 = jest.fn().mockResolvedValue({ error: null });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const del = jest.fn().mockReturnValue({ eq: eq1 });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });
    await unlikePost({ postId: 'p1', userId: 'u1' });
    expect(supabase.from).toHaveBeenCalledWith('post_likes');
    expect(eq1).toHaveBeenCalledWith('post_id', 'p1');
    expect(eq2).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('throws on error', async () => {
    const eq2 = jest.fn().mockResolvedValue({ error: { message: 'x' } });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const del = jest.fn().mockReturnValue({ eq: eq1 });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });
    await expect(unlikePost({ postId: 'p1', userId: 'u1' })).rejects.toBeTruthy();
  });
});
