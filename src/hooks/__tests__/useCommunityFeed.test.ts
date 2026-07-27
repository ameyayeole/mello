import { nextFeedPage } from '../useCommunityFeed';
import { CommunityPost } from '@/types/models';

const post = (
  id: string,
  sessionId = 's1',
  sessionTotal = 30
): CommunityPost => ({
  id,
  author_id: 'a',
  author_name: 'A',
  author_photo_url: null,
  type: 'text',
  visibility: 'public',
  body: 'x',
  media: [],
  ref_wrap_event_id: null,
  city: 'Mumbai',
  like_count: 0,
  comment_count: 0,
  liked_by_me: false,
  comments_enabled: true,
  created_at: 't',
  score: 1,
  session_id: sessionId,
  session_total: sessionTotal,
});

const page = (overrides = {}) => ({
  sessionId: 's1',
  tier: 1,
  offset: 0,
  sessionTotal: null,
  ...overrides,
});

describe('nextFeedPage', () => {
  it('advances the offset while the session has more rows', () => {
    expect(nextFeedPage([post('1')], page(), 10)).toEqual({
      sessionId: 's1',
      tier: 1,
      offset: 10,
      sessionTotal: 30,
    });
  });

  it('adopts the session id returned by a freshly built session', () => {
    const first = page({ sessionId: null });
    expect(nextFeedPage([post('1', 'new-session')], first, 10)).toEqual({
      sessionId: 'new-session',
      tier: 1,
      offset: 10,
      sessionTotal: 30,
    });
  });

  // The critical regression guard. A post moderated mid-session drops out of
  // its slice, so a short page is NOT the end of the feed. Driving pagination
  // off page length (as the old keyset did) truncates the feed silently.
  it('keeps paging after a short page when the session has rows left', () => {
    const shortPage = [post('1'), post('2')]; // 2 rows for a limit of 10
    expect(nextFeedPage(shortPage, page(), 10)).toEqual({
      sessionId: 's1',
      tier: 1,
      offset: 10,
      sessionTotal: 30,
    });
  });

  // The second, sharper regression guard. session_id and session_total ride on
  // each returned ROW, so a page that comes back completely EMPTY carries
  // neither — and an empty page is a normal occurrence: community_feed_page is
  // SECURITY INVOKER, so RLS can drop every row in a slice that was moderated,
  // hidden or blocked since the snapshot was taken. If the pager fell back to
  // reading total off the (missing) row, it would see `session_total ?? 0`,
  // conclude the session is exhausted, and silently skip the rest of it — this
  // is why FeedPageParam carries `sessionTotal` forward across pages instead.
  it('keeps paging after an empty page mid-session, using the sessionTotal carried in the page param', () => {
    const midSession = page({ offset: 10, sessionTotal: 30 });
    expect(nextFeedPage([], midSession, 10)).toEqual({
      sessionId: 's1',
      tier: 1,
      offset: 20,
      sessionTotal: 30,
    });
  });

  it('advances to the next tier when the session is exhausted', () => {
    const last = page({ offset: 20 });
    expect(nextFeedPage([post('1', 's1', 30)], last, 10)).toEqual({
      sessionId: null,
      tier: 2,
      offset: 0,
      sessionTotal: null,
    });
  });

  it('advances the tier when a tier returns nothing at all', () => {
    expect(nextFeedPage([], page({ sessionId: null }), 10)).toEqual({
      sessionId: null,
      tier: 2,
      offset: 0,
      sessionTotal: null,
    });
  });

  it('ends the feed after the last tier', () => {
    const last = page({ tier: 3, offset: 20 });
    expect(nextFeedPage([post('1', 's1', 30)], last, 10)).toBeUndefined();
  });

  it('ends the feed when the last tier returns nothing', () => {
    expect(
      nextFeedPage([], page({ tier: 3, sessionId: null }), 10)
    ).toBeUndefined();
  });
});
