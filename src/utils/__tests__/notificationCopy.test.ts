import { notificationCopy } from '@/utils/notificationCopy';

describe('notificationCopy — community', () => {
  it('comment_mention reads "mentioned you in a comment"', () => {
    expect(notificationCopy('comment_mention', { senderName: 'Sri' })).toEqual({
      title: 'Mention',
      body: 'mentioned you in a comment',
    });
  });

  it('post_liked coalesces the count into the body', () => {
    expect(notificationCopy('post_liked', { senderName: 'Sri', count: 3 }).body).toBe(
      'Sri and 2 others liked your post'
    );
    expect(notificationCopy('post_liked', { senderName: 'Sri', count: 1 }).body).toBe(
      'Sri liked your post'
    );
  });
});
