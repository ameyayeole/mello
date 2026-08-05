import { freshChannel } from '../realtime';
import { supabase } from '../supabase';

// The whole point of `freshChannel` is the *name* it asks the client for, so the
// client is a spy that records the topic and hands back a distinct object.
jest.mock('../supabase', () => ({
  supabase: { channel: jest.fn((topic: string) => ({ topic })) },
}));

const channelMock = supabase.channel as unknown as jest.Mock;

function topicsFor(name: string, times: number) {
  return Array.from({ length: times }, () => {
    freshChannel(name);
    return channelMock.mock.calls[channelMock.mock.calls.length - 1][0];
  });
}

describe('freshChannel', () => {
  beforeEach(() => channelMock.mockClear());

  // The bug this exists for: two live subscribers asking for the same topic get
  // handed one already-subscribed channel, and `.on()` on that throws.
  it('never asks for the same topic twice', () => {
    const topics = topicsFor('dm:me:them', 5);
    expect(new Set(topics).size).toBe(5);
  });

  // Distinct across names too — a suffix shared between two different names
  // would be fine, but a name *colliding* with another name's suffixed form
  // would not.
  it('keeps the caller-supplied name recognisable', () => {
    const [topic] = topicsFor('event:abc:messages', 1);
    expect(topic.startsWith('event:abc:messages')).toBe(true);
  });

  it('does not collide between different names', () => {
    const all = [...topicsFor('dm:a:b', 3), ...topicsFor('dm:a:c', 3)];
    expect(new Set(all).size).toBe(6);
  });
});
