import {
  getComments,
  getReplies,
  addComment,
  deleteComment,
  setCommentsEnabled,
} from '../comments.service';
import { supabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

describe('getComments', () => {
  it('calls post_comments_ranked with post + viewer', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getComments({ postId: 'p1', viewerId: 'u1' });
    expect(supabase.rpc).toHaveBeenCalledWith('post_comments_ranked', {
      p_post_id: 'p1',
      p_viewer_id: 'u1',
      p_limit: 100,
    });
  });

  it('throws on error', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'x' },
    });
    await expect(getComments({ postId: 'p1', viewerId: 'u1' })).rejects.toBeTruthy();
  });
});

describe('getReplies', () => {
  it('calls post_comment_replies with parent + viewer', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getReplies({ parentId: 'c1', viewerId: 'u1' });
    expect(supabase.rpc).toHaveBeenCalledWith('post_comment_replies', {
      p_parent_id: 'c1',
      p_viewer_id: 'u1',
    });
  });
});

describe('addComment', () => {
  it('inserts a trimmed top-level comment and returns its id', async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: 'c1' }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    const id = await addComment({ postId: 'p1', authorId: 'u1', body: '  hi ' });

    expect(supabase.from).toHaveBeenCalledWith('post_comments');
    expect(insert).toHaveBeenCalledWith({
      post_id: 'p1',
      author_id: 'u1',
      body: 'hi',
      parent_id: null,
    });
    expect(id).toBe('c1');
  });

  it('carries a parent_id for a reply', async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: 'c2' }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await addComment({ postId: 'p1', authorId: 'u1', body: 're', parentId: 'c1' });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ parent_id: 'c1' })
    );
  });
});

describe('deleteComment', () => {
  it('tombstones (update) when the comment has replies', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await deleteComment({ commentId: 'c1', hasReplies: true });

    expect(supabase.from).toHaveBeenCalledWith('post_comments');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ body: '', mentions: [] })
    );
    expect(eq).toHaveBeenCalledWith('id', 'c1');
  });

  it('hard-deletes a leaf', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await deleteComment({ commentId: 'c1', hasReplies: false });

    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'c1');
  });
});

describe('setCommentsEnabled', () => {
  it('updates comments_enabled on the post', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await setCommentsEnabled({ postId: 'p1', enabled: false });

    expect(supabase.from).toHaveBeenCalledWith('posts');
    expect(update).toHaveBeenCalledWith({ comments_enabled: false });
    expect(eq).toHaveBeenCalledWith('id', 'p1');
  });
});
