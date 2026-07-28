import { likeComment, unlikeComment } from '../commentLikes.service';
import { supabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({ supabase: { from: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());

describe('likeComment', () => {
  it('inserts a (comment_id, user_id) row', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ insert });
    await likeComment({ commentId: 'c1', userId: 'u1' });
    expect(supabase.from).toHaveBeenCalledWith('comment_likes');
    expect(insert).toHaveBeenCalledWith({ comment_id: 'c1', user_id: 'u1' });
  });

  it('throws on error', async () => {
    const insert = jest.fn().mockResolvedValue({ error: { message: 'x' } });
    (supabase.from as jest.Mock).mockReturnValue({ insert });
    await expect(likeComment({ commentId: 'c1', userId: 'u1' })).rejects.toBeTruthy();
  });
});

describe('unlikeComment', () => {
  it('deletes by comment then user', async () => {
    const eq2 = jest.fn().mockResolvedValue({ error: null });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const del = jest.fn().mockReturnValue({ eq: eq1 });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });
    await unlikeComment({ commentId: 'c1', userId: 'u1' });
    expect(supabase.from).toHaveBeenCalledWith('comment_likes');
    expect(eq1).toHaveBeenCalledWith('comment_id', 'c1');
    expect(eq2).toHaveBeenCalledWith('user_id', 'u1');
  });
});
