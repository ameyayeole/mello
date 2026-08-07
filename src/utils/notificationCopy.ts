import { NotificationType } from '@/types/models';

// Banner copy for a notification, used for the local (foreground/simulator)
// banner. Keep in sync with composeCopy in
// supabase/functions/send-push-notification/index.ts, which does the same for
// remote push.
export function notificationCopy(
  type: NotificationType,
  opts: {
    senderName?: string;
    eventTitle?: string;
    pending?: boolean;
    kind?: string;
    preview?: string;
    count?: number;
  }
): { title: string; body: string } {
  const senderName = opts.senderName ?? 'Someone';
  const eventTitle = opts.eventTitle ?? 'your event';
  switch (type) {
    case 'join_request':
      return opts.pending
        ? {
            title: 'New join request',
            body: `${senderName} requested to join ${eventTitle}`,
          }
        : { title: 'New attendee', body: `${senderName} joined ${eventTitle}` };
    case 'join_approved':
      return {
        title: "You're in! 🎉",
        body: `Your request to join ${eventTitle} was approved`,
      };
    case 'friend_request':
      return {
        title: 'Friend request',
        body: `${senderName} sent you a friend request`,
      };
    case 'friend_accepted':
      return {
        title: 'Request accepted 🎉',
        body: `${senderName} accepted your friend request`,
      };
    case 'new_message':
      return opts.kind === 'dm'
        ? { title: senderName, body: 'sent you a message' }
        : { title: eventTitle, body: `${senderName} sent a message` };
    case 'event_starting_soon':
      return { title: 'Starting soon', body: `${eventTitle} is starting soon` };
    case 'event_update':
      return {
        title: 'Event updated',
        body: `${senderName} updated ${eventTitle}`,
      };
    case 'friend_joined_event':
      return {
        title: 'Friend joined',
        body: `${senderName} joined an event with you`,
      };
    case 'event_boosted':
      return {
        title: '🔥 Now hot',
        body: `${eventTitle} you wishlisted just got boosted`,
      };
    case 'host_announcement':
      return {
        title: `📣 ${eventTitle}`,
        body: opts.preview
          ? `Announcement: ${opts.preview}`
          : `${senderName} made an announcement`,
      };
    case 'mention':
      return opts.kind === 'dm'
        ? { title: senderName, body: 'mentioned you in a message' }
        : {
            title: eventTitle,
            body: `${senderName} mentioned you`,
          };
    case 'wrap_ready':
      return {
        title: `How was ${eventTitle}?`,
        body: 'Add your photos and the people you met — wrap it up',
      };
    case 'wrap_unlocked':
      return {
        title: 'The wrap is open',
        body: `Enough of you showed up for ${eventTitle} — go see it`,
      };
    case 'note_received':
      return {
        title: 'You got a note 💌',
        body: `Someone from ${eventTitle} left you a note`,
      };
    case 'photo_liked':
      return { title: eventTitle, body: `${senderName} liked your photo` };
    case 'photo_commented':
      return { title: eventTitle, body: `${senderName} commented on your photo` };
    case 'encore_requested':
      return {
        title: 'Round two? 🔁',
        body: `People want you to run ${eventTitle} back`,
      };
    case 'post_liked': {
      // Coalesced: payload.count is the total likers on this post in the window.
      const others = (opts.count ?? 1) - 1;
      return {
        title: 'New like',
        body:
          others > 0
            ? `${senderName} and ${others} other${others > 1 ? 's' : ''} liked your post`
            : `${senderName} liked your post`,
      };
    }
    case 'post_commented': {
      const others = (opts.count ?? 1) - 1;
      return {
        title: 'New comment',
        body:
          others > 0
            ? `${senderName} and ${others} other${others > 1 ? 's' : ''} commented on your post`
            : `${senderName} commented on your post`,
      };
    }
    case 'comment_reply':
      return { title: 'New reply', body: `${senderName} replied to your comment` };
    case 'comment_liked': {
      const others = (opts.count ?? 1) - 1;
      return {
        title: 'New like',
        body:
          others > 0
            ? `${senderName} and ${others} other${others > 1 ? 's' : ''} liked your comment`
            : `${senderName} liked your comment`,
      };
    }
    case 'comment_mention':
      // Not coalesced (one row per comment) — the body mirrors the chat `mention`
      // banner shape (no sender prefix; the row draws the avatar + name).
      return { title: 'Mention', body: 'mentioned you in a comment' };
    case 'post_mention':
      // Not coalesced (one row per post) — body mirrors the chat `mention` shape.
      return { title: 'Mention', body: 'mentioned you in a post' };
    case 'poll_closed':
      // System-sent (sender_id NULL) — no actor prefix; the row shows the app.
      return { title: 'Poll closed', body: 'Your poll has closed — see the results' };
    default:
      return { title: 'Mello', body: 'You have a new notification' };
  }
}
