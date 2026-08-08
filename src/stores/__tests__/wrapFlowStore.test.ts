import { useWrapFlowStore, wrapFlowSteps } from '../wrapFlowStore';

const reset = () => useWrapFlowStore.getState().reset();
const s = () => useWrapFlowStore.getState();

describe('wrapFlowSteps', () => {
  it('gives a guest five steps, feedback second to last', () => {
    expect(wrapFlowSteps(false)).toEqual([
      'photos',
      'rate',
      'rewind',
      'feedback',
      'done',
    ]);
  });

  it('drops feedback for the host — they do not rate their own event', () => {
    expect(wrapFlowSteps(true)).toEqual(['photos', 'rate', 'rewind', 'done']);
  });
});

describe('useWrapFlowStore', () => {
  beforeEach(reset);

  it('starts on photos', () => {
    s().start('e1', false);
    expect(s().step).toBe('photos');
    expect(s().eventId).toBe('e1');
  });

  it('walks a guest through every step in order', () => {
    s().start('e1', false);
    const seen = [s().step];
    for (let i = 0; i < 4; i++) {
      s().next();
      seen.push(s().step);
    }
    expect(seen).toEqual(['photos', 'rate', 'rewind', 'feedback', 'done']);
  });

  it('skips feedback for a host', () => {
    s().start('e1', true);
    s().next();
    s().next();
    s().next();
    expect(s().step).toBe('done');
  });

  it('does not run off the end', () => {
    s().start('e1', true);
    for (let i = 0; i < 10; i++) s().next();
    expect(s().step).toBe('done');
  });

  it('does not run off the front', () => {
    s().start('e1', false);
    s().back();
    s().back();
    expect(s().step).toBe('photos');
  });

  it('goes back through the same list it came forward on', () => {
    s().start('e1', true);
    s().next();
    s().next();
    s().next();
    expect(s().step).toBe('done');
    s().back();
    expect(s().step).toBe('rewind');
  });

  it('clears itself on reset so a second event does not inherit a step', () => {
    s().start('e1', false);
    s().next();
    reset();
    expect(s().step).toBe('photos');
    expect(s().eventId).toBeNull();
  });
});
