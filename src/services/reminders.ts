import * as Notifications from 'expo-notifications';

// Pre-event safety reminder (popup #4): a local notification scheduled on this
// device ~2 hours before an event the user joined. Scheduled at join time and
// cancelled if they leave, so no backend cron is involved.

const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000;

function reminderId(eventId: string): string {
  return `event-safety-reminder-${eventId}`;
}

export async function scheduleEventSafetyReminder(event: {
  id: string;
  title: string;
  location_name?: string | null;
  starts_at: string;
}): Promise<void> {
  const fireAt = new Date(event.starts_at).getTime() - REMINDER_LEAD_MS;
  // Joining inside the 2-hour window (or a past event) — nothing to schedule.
  if (fireAt <= Date.now()) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: reminderId(event.id),
      content: {
        title: `Heading to ${event.title} soon?`,
        body:
          'Share your plan with a trusted contact, arrange your own way there ' +
          'and back, and keep an eye on your drink and belongings.',
        // The full payload lets the tap handler open safety sheet #4 with
        // "Share my plan" without refetching the event.
        data: {
          type: 'event_safety_reminder',
          eventId: event.id,
          title: event.title,
          locationName: event.location_name ?? null,
          startsAt: event.starts_at,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAt),
      },
    });
  } catch {
    // Notification permission denied or unavailable — the reminder is a
    // nice-to-have, never block the join over it.
  }
}

export async function cancelEventSafetyReminder(eventId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(reminderId(eventId));
  } catch {
    // Nothing scheduled — fine.
  }
}
