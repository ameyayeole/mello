jest.mock('expo-router');
jest.mock('@/services/community/impressions.service');

import { createImpressionBuffer } from '../useImpressionTracker';

describe('createImpressionBuffer', () => {
  it('collects ids and hands them to flush on drain', () => {
    const flush = jest.fn();
    const buf = createImpressionBuffer(flush);
    buf.add('p1');
    buf.add('p2');
    buf.drain();
    expect(flush).toHaveBeenCalledWith(['p1', 'p2']);
  });

  // The server dedupes too (SELECT DISTINCT), but sending one id twice in a
  // batch is pure waste on a mobile connection.
  it('deduplicates within a batch', () => {
    const flush = jest.fn();
    const buf = createImpressionBuffer(flush);
    buf.add('p1');
    buf.add('p1');
    buf.drain();
    expect(flush).toHaveBeenCalledWith(['p1']);
  });

  it('does not call flush when the buffer is empty', () => {
    const flush = jest.fn();
    createImpressionBuffer(flush).drain();
    expect(flush).not.toHaveBeenCalled();
  });

  it('clears after draining, so a second drain is a no-op', () => {
    const flush = jest.fn();
    const buf = createImpressionBuffer(flush);
    buf.add('p1');
    buf.drain();
    buf.drain();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  // A post seen, flushed, then seen again later is a genuine second view.
  it('accepts an id again after it has been drained', () => {
    const flush = jest.fn();
    const buf = createImpressionBuffer(flush);
    buf.add('p1');
    buf.drain();
    buf.add('p1');
    buf.drain();
    expect(flush).toHaveBeenNthCalledWith(2, ['p1']);
  });

  it('reports its size', () => {
    const buf = createImpressionBuffer(jest.fn());
    expect(buf.size()).toBe(0);
    buf.add('p1');
    buf.add('p1');
    expect(buf.size()).toBe(1);
  });
});
