import { getCommunityFeed, createTextPost } from '../posts.service';
import { supabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

describe('getCommunityFeed', () => {
  it('passes null cursor params on the first page', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getCommunityFeed({ userId: 'u1', cursor: null, limit: 10 });
    expect(supabase.rpc).toHaveBeenCalledWith('community_feed', {
      p_user_id: 'u1',
      p_cursor_score: null,
      p_cursor_created_at: null,
      p_cursor_id: null,
      p_limit: 10,
    });
  });

  it('forwards the cursor on later pages', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getCommunityFeed({
      userId: 'u1',
      cursor: { score: 42, createdAt: '2026-07-25T00:00:00Z', id: 'p9' },
      limit: 10,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('community_feed', {
      p_user_id: 'u1',
      p_cursor_score: 42,
      p_cursor_created_at: '2026-07-25T00:00:00Z',
      p_cursor_id: 'p9',
      p_limit: 10,
    });
  });

  it('throws on rpc error', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    await expect(
      getCommunityFeed({ userId: 'u1', cursor: null })
    ).rejects.toBeTruthy();
  });
});

describe('createTextPost', () => {
  it('inserts the trimmed body with author, visibility and city', async () => {
    const single = jest
      .fn()
      .mockResolvedValue({ data: { id: 'new1' }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    const id = await createTextPost({
      authorId: 'u1',
      body: '  hi  ',
      visibility: 'public',
      city: 'Mumbai',
    });

    expect(supabase.from).toHaveBeenCalledWith('posts');
    expect(insert).toHaveBeenCalledWith({
      author_id: 'u1',
      type: 'text',
      body: 'hi',
      visibility: 'public',
      city: 'Mumbai',
    });
    expect(id).toBe('new1');
  });
});
