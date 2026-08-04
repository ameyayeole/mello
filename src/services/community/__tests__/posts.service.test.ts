import { getCommunityFeed, createTextPost } from '../posts.service';
import { supabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

describe('getCommunityFeed', () => {
  // sessionTotal is client-side bookkeeping (an empty page carries neither
  // session_id nor session_total on its rows), never read by the RPC — see
  // FeedPageParam. Defaulting it here keeps these calls representative of a
  // real page param without every test having to spell it out.
  const page = (o = {}) => ({ sessionId: null, tier: 1, offset: 0, sessionTotal: null, ...o });

  it('builds a new session and pins on the first page', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getCommunityFeed({ userId: 'u1', page: page(), pinOwn: true, limit: 10 });
    expect(supabase.rpc).toHaveBeenCalledWith('community_feed_page', {
      p_user_id: 'u1',
      p_session_id: null,
      p_tier: 1,
      p_pin_own: true,
      p_offset: 0,
      p_limit: 10,
    });
  });

  // The pull-to-refresh release: same build, pinning explicitly off.
  it('does not pin when pinOwn is false', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getCommunityFeed({ userId: 'u1', page: page(), pinOwn: false, limit: 10 });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'community_feed_page',
      expect.objectContaining({ p_pin_own: false })
    );
  });

  it('reuses the session and advances the offset on later pages', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getCommunityFeed({
      userId: 'u1',
      page: page({ sessionId: 's1', offset: 10 }),
      pinOwn: true,
      limit: 10,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('community_feed_page', {
      p_user_id: 'u1',
      p_session_id: 's1',
      p_tier: 1,
      // Pinning is decided when the session is BUILT. A continuation page has
      // nothing to pin, so forwarding true here would be misleading noise.
      p_pin_own: false,
      p_offset: 10,
      p_limit: 10,
    });
  });

  // A tier advance builds a fresh session, so sessionId is null — but the tail
  // of the feed is never the right place for your own post to reappear on top.
  it('does not pin when building a session for tier 2', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [], error: null });
    await getCommunityFeed({
      userId: 'u1',
      page: page({ tier: 2 }),
      pinOwn: true,
      limit: 10,
    });
    expect(supabase.rpc).toHaveBeenCalledWith(
      'community_feed_page',
      expect.objectContaining({ p_tier: 2, p_pin_own: false })
    );
  });

  it('throws on rpc error', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    await expect(
      getCommunityFeed({ userId: 'u1', page: page(), pinOwn: true })
    ).rejects.toBeTruthy();
  });

  // community_feed_page raises no_data_found (SQLSTATE P0002) when the session
  // id was pruned by the 6-hour TTL, or belongs to another user. That should
  // self-heal, not surface as a broken feed.
  describe('expired session recovery', () => {
    it('retries once against a fresh session when the session has expired', async () => {
      (supabase.rpc as jest.Mock)
        .mockResolvedValueOnce({
          data: null,
          error: { code: 'P0002', message: 'feed session s1 not found or expired' },
        })
        .mockResolvedValueOnce({ data: [{ id: 'p1' }], error: null });

      const result = await getCommunityFeed({
        userId: 'u1',
        page: page({ sessionId: 's1', offset: 20 }),
        pinOwn: true,
        limit: 10,
      });

      expect(supabase.rpc).toHaveBeenCalledTimes(2);
      expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'community_feed_page', {
        p_user_id: 'u1',
        p_session_id: 's1',
        p_tier: 1,
        p_pin_own: false,
        p_offset: 20,
        p_limit: 10,
      });
      // Rebuilding is a brand-new ranking, so resuming at the old offset (20)
      // would land in an unrelated part of the new list — reset to 0.
      expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'community_feed_page', {
        p_user_id: 'u1',
        p_session_id: null,
        p_tier: 1,
        p_pin_own: true,
        p_offset: 0,
        p_limit: 10,
      });
      expect(result).toEqual([{ id: 'p1' }]);
    });

    it('matches the expired-session error by code, not by message text alone', async () => {
      // No message match on purpose — only `code` identifies this one, to
      // prove detection isn't just a substring check on the message.
      (supabase.rpc as jest.Mock)
        .mockResolvedValueOnce({ data: null, error: { code: 'P0002', message: 'nope' } })
        .mockResolvedValueOnce({ data: [], error: null });

      await getCommunityFeed({
        userId: 'u1',
        page: page({ sessionId: 's1' }),
        pinOwn: true,
      });

      expect(supabase.rpc).toHaveBeenCalledTimes(2);
    });

    it('does not retry when sessionId was already null', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: { code: 'P0002', message: 'feed session null not found or expired' },
      });

      await expect(
        getCommunityFeed({ userId: 'u1', page: page(), pinOwn: true })
      ).rejects.toBeTruthy();
      expect(supabase.rpc).toHaveBeenCalledTimes(1);
    });

    it('throws the retry error if the rebuilt session also fails', async () => {
      (supabase.rpc as jest.Mock)
        .mockResolvedValueOnce({
          data: null,
          error: { code: 'P0002', message: 'feed session s1 not found or expired' },
        })
        .mockResolvedValueOnce({ data: null, error: { message: 'still broken' } });

      await expect(
        getCommunityFeed({ userId: 'u1', page: page({ sessionId: 's1' }), pinOwn: true })
      ).rejects.toEqual({ message: 'still broken' });
      expect(supabase.rpc).toHaveBeenCalledTimes(2);
    });

    it('does not retry on an unrelated rpc error even with a session id set', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });

      await expect(
        getCommunityFeed({ userId: 'u1', page: page({ sessionId: 's1' }), pinOwn: true })
      ).rejects.toBeTruthy();
      expect(supabase.rpc).toHaveBeenCalledTimes(1);
    });
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
      // Explicitly null rather than absent when nothing is linked (070), so the
      // column is written on every path instead of relying on its default.
      ref_event_id: null,
    });
    expect(id).toBe('new1');
  });
});
