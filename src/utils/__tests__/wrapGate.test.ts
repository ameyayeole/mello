import { wrapGateState } from '../wrapGate';
import { WrapStatus } from '@/types/models';

const base: WrapStatus = {
  coAttendeeCount: 5,
  ratedCount: 5,
  myPhotoCount: 1,
  votedCategories: ['mvp', 'first_to_arrive', 'next_host', 'best_vibes'],
  feedbackDone: true,
  isHost: false,
  viewCount: 1,
  encoreRequested: false,
  encoreCount: 0,
  contributorCount: 0,
  contributorsNeeded: 3,
  contributors: [],
  hoursSinceEnd: 1,
};

const s = (o: Partial<WrapStatus> = {}): WrapStatus => ({ ...base, ...o });

describe('wrapGateState', () => {
  it('is locked while the status is still loading', () => {
    expect(wrapGateState(undefined)).toBe('locked');
  });

  it('is locked when my own steps are unfinished, however many contributed', () => {
    expect(wrapGateState(s({ myPhotoCount: 0, contributorCount: 9 }))).toBe(
      'locked'
    );
  });

  it('is locked when I am done but the group has not reached the threshold', () => {
    expect(wrapGateState(s({ contributorCount: 2 }))).toBe('locked');
  });

  it('opens once the group reaches the threshold', () => {
    expect(wrapGateState(s({ contributorCount: 3 }))).toBe('open');
  });

  it('opens when the group overshoots the threshold', () => {
    expect(wrapGateState(s({ contributorCount: 8 }))).toBe('open');
  });

  it('becomes unlockable at 48 hours when the group never showed up', () => {
    expect(wrapGateState(s({ contributorCount: 1, hoursSinceEnd: 49 }))).toBe(
      'unlockable'
    );
  });

  it('is still locked at exactly 48 hours', () => {
    expect(wrapGateState(s({ contributorCount: 1, hoursSinceEnd: 48 }))).toBe(
      'locked'
    );
  });

  it('never offers a force-unlock to someone who has not done their own steps', () => {
    expect(
      wrapGateState(s({ myPhotoCount: 0, contributorCount: 1, hoursSinceEnd: 99 }))
    ).toBe('locked');
  });

  it('prefers open over unlockable when both would apply', () => {
    expect(
      wrapGateState(s({ contributorCount: 5, hoursSinceEnd: 99 }))
    ).toBe('open');
  });

  it('is host-aware: a host with no feedback is still done', () => {
    expect(
      wrapGateState(s({ isHost: true, feedbackDone: false, contributorCount: 3 }))
    ).toBe('open');
  });
});
