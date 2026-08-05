import { messageExcerpt, replyOf, replyTargetOf } from '../chatActions';

// chatActions reaches for expo-router and the image picker at module scope; the
// reply helpers are pure, so those are stubbed rather than exercised.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@/services/moderation.service', () => ({ reportUser: jest.fn() }));

const ME = 'me-id';

function textMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    type: 'text',
    content: 'see you there',
    sender_id: 'them-id',
    sender: { name: 'Ameya' },
    ...overrides,
  };
}

describe('replyTargetOf', () => {
  it('quotes the sender by name', () => {
    expect(replyTargetOf(textMessage(), ME)).toEqual({
      id: 'm1',
      preview: 'see you there',
      senderName: 'Ameya',
    });
  });

  // A quote of your own message reads "You", not your own name — matching how
  // the rest of the app addresses you.
  it('calls your own message yours', () => {
    const mine = textMessage({ sender_id: ME, sender: { name: 'Srishank' } });
    expect(replyTargetOf(mine, ME).senderName).toBe('You');
  });

  // A DM row does not always carry a joined sender, so the screen passes the
  // name it already knows from the route.
  it('falls back to the name the caller supplies', () => {
    const noJoin = textMessage({ sender: null });
    expect(replyTargetOf(noJoin, ME, 'Riya').senderName).toBe('Riya');
    expect(replyTargetOf(noJoin, ME).senderName).toBe('Them');
  });

  it('quotes a photo as a photo, not as a URL', () => {
    const photo = textMessage({
      type: 'image',
      content: 'https://example.com/very/long/photo.jpg',
    });
    expect(replyTargetOf(photo, ME).preview).toBe('[photo]');
  });

  // The preview is what gets *stored* on every reply, so a wall of text must not
  // be copied wholesale.
  it('caps a long message', () => {
    const long = textMessage({ content: 'x'.repeat(4000) });
    expect(replyTargetOf(long, ME).preview.length).toBe(240);
  });

  // No hand-appended ellipsis, at any length: the quote block clamps to three
  // lines and the text engine puts the "…" at the end of the third *rendered*
  // line. A character-counted one would sit in the wrong place at a different
  // width or font scale, and would double up with the real one.
  it('never adds its own ellipsis', () => {
    expect(replyTargetOf(textMessage(), ME).preview).not.toContain('…');
    const long = textMessage({ content: 'x'.repeat(4000) });
    expect(replyTargetOf(long, ME).preview).not.toContain('…');
  });

  // The cap has to leave the clamp something to truncate — this is the assertion
  // that would catch someone "tidying" it down to the report excerpt's 140,
  // which is about three lines and would make the ellipsis come and go with the
  // way the words happen to wrap.
  it('stores more than three lines can show', () => {
    const long = textMessage({ content: 'z'.repeat(4000) });
    const { preview } = replyTargetOf(long, ME);
    expect(preview.length).toBeGreaterThan(messageExcerpt(long).length);
  });
});

describe('replyOf', () => {
  it('reads the snapshot back off a stored row', () => {
    expect(
      replyOf({
        reply_to_id: 'm1',
        reply_preview: 'see you there',
        reply_sender_name: 'Ameya',
      })
    ).toEqual({ id: 'm1', preview: 'see you there', senderName: 'Ameya' });
  });

  it('is null for a message that is not a reply', () => {
    expect(replyOf({})).toBeNull();
    expect(replyOf({ reply_to_id: null })).toBeNull();
  });

  // The original can be deleted (`on delete set null` in migration 072). What is
  // left must still be a usable quote rather than undefined leaking into the UI.
  it('survives a row whose columns are half-filled', () => {
    expect(replyOf({ reply_to_id: 'm1' })).toEqual({
      id: 'm1',
      preview: '',
      senderName: '',
    });
  });
});
