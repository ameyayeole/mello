import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Called two ways:
//  1. By the on_notification_push DB trigger (migration 021) with
//     { record: <notifications row> } — copy is composed here.
//  2. Directly with { recipient_id, title, body, data } (legacy shape).
interface DirectPayload {
  recipient_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface NotificationRecord {
  id: string;
  recipient_id: string;
  sender_id: string | null;
  type: string;
  event_id: string | null;
  payload: Record<string, unknown> | null;
}

function composeCopy(
  record: NotificationRecord,
  senderName: string
): { title: string; body: string } {
  const eventTitle = (record.payload?.eventTitle as string) ?? 'your event';
  switch (record.type) {
    case 'join_request':
      return record.payload?.pending
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
      return record.payload?.kind === 'dm'
        ? { title: senderName, body: 'sent you a message' }
        : { title: eventTitle, body: `${senderName} sent a message` };
    case 'event_starting_soon':
      return {
        title: 'Starting soon',
        body: `${eventTitle} is starting soon`,
      };
    case 'event_update':
      return { title: 'Event updated', body: `${senderName} updated ${eventTitle}` };
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
        body: record.payload?.preview
          ? `Announcement: ${record.payload.preview}`
          : `${senderName} made an announcement`,
      };
    case 'mention':
      return record.payload?.kind === 'dm'
        ? { title: senderName, body: 'mentioned you in a message' }
        : { title: eventTitle, body: `${senderName} mentioned you` };
    case 'wrap_ready':
      return {
        title: `How was ${eventTitle}?`,
        body: 'Rate the people, drop your best photos, vote superlatives',
      };
    case 'note_received':
      return {
        title: 'You got a note 💌',
        body: `Someone from ${eventTitle} left you a note`,
      };
    case 'photo_liked':
      return {
        title: `${eventTitle}`,
        body: `${senderName} liked your photo`,
      };
    case 'photo_commented':
      return {
        title: `${eventTitle}`,
        body: `${senderName} commented on your photo`,
      };
    case 'encore_requested':
      return {
        title: 'Round two? 🔁',
        body: `People want you to run ${eventTitle} back`,
      };
    default:
      return { title: 'Mello', body: `${senderName} sent you a notification` };
  }
}

serve(async (req) => {
  const payload = await req.json();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let recipientId: string;
  let title: string;
  let body: string;
  let data: Record<string, unknown>;

  if (payload.record) {
    const record = payload.record as NotificationRecord;
    recipientId = record.recipient_id;

    let senderName = 'Someone';
    if (record.sender_id) {
      const { data: sender } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', record.sender_id)
        .single();
      if (sender?.name) senderName = sender.name;
    }

    ({ title, body } = composeCopy(record, senderName));
    data = {
      type: record.type,
      eventId: record.event_id,
      friendId: record.payload?.friendId ?? null,
      kind: record.payload?.kind ?? null,
      notificationId: record.id,
    };
  } else {
    const direct = payload as DirectPayload;
    recipientId = direct.recipient_id;
    title = direct.title;
    body = direct.body;
    data = direct.data ?? {};
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', recipientId)
    .single();

  if (!profile?.expo_push_token) {
    return new Response('No push token', { status: 200 });
  }

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: profile.expo_push_token,
      title,
      body,
      data,
      sound: 'default',
      priority: 'high',
    }),
  });

  return new Response('OK', { status: 200 });
});
