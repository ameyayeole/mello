import { recapSections } from '../wrapRecap';
import { WrapStatus, WrapSummary } from '@/types/models';

const summary: WrapSummary = {
  attendeeCount: 8,
  photoCount: 12,
  likeCount: 34,
  commentCount: 5,
  messageCount: 120,
  myThumbsReceived: 6,
  superlatives: [
    { category: 'mvp', votes: 4, winner_id: 'u1', winner_name: 'Ana', winner_photo_url: null },
    { category: 'best_vibes', votes: 2, winner_id: null, winner_name: null, winner_photo_url: null },
  ] as never,
};

const status = { encoreCount: 5 } as WrapStatus;

describe('recapSections', () => {
  it('puts photos, people and reactions in the shared half', () => {
    const { shared } = recapSections(summary, status);
    expect(shared.photoCount).toBe(12);
    expect(shared.attendeeCount).toBe(8);
    expect(shared.reactionCount).toBe(34);
  });

  it('carries the encore count into the shared half', () => {
    expect(recapSections(summary, status).shared.encoreCount).toBe(5);
  });

  it('only shows superlatives that reached the reveal threshold', () => {
    const { shared } = recapSections(summary, status);
    expect(shared.superlatives).toHaveLength(1);
    expect(shared.superlatives[0].category).toBe('mvp');
  });

  it('keeps thumbs received in the private half', () => {
    expect(recapSections(summary, status).yours.thumbsReceived).toBe(6);
  });

  it('never puts a per-person thumb figure in the shared half', () => {
    const { shared } = recapSections(summary, status);
    expect(JSON.stringify(shared)).not.toContain('thumbs');
  });

  it('survives a summary with no superlatives at all', () => {
    const bare = { ...summary, superlatives: [] };
    expect(recapSections(bare, status).shared.superlatives).toEqual([]);
  });

  it('treats a missing status as no encores rather than crashing', () => {
    expect(recapSections(summary, undefined).shared.encoreCount).toBe(0);
  });
});
