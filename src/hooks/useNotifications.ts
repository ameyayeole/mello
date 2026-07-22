import { useEffect, useRef } from 'react';
import { queryKeys } from '@/constants/queryKeys';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { updatePushToken } from '@/services/notifications.service';
import { notificationCopy } from '@/utils/notificationCopy';
import { Notification } from '@/types/models';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Notification types whose tap target is the event card (bottom sheet).
const EVENT_SHEET_TYPES = new Set([
  'join_request',
  'join_approved',
  'event_update',
  'event_starting_soon',
  'friend_joined_event',
  'event_boosted',
]);

// Routes a tapped notification (push or local banner) to its destination.
export function openNotificationTarget(data: Record<string, unknown>) {
  const type = data?.type as string | undefined;
  const eventId = data?.eventId ? String(data.eventId) : null;

  // Tapping the pre-event safety reminder opens safety sheet #4
  // (rendered by the tabs layout).
  if (type === 'event_safety_reminder' && eventId) {
    useUIStore.getState().setSafetyReminderEvent({
      id: eventId,
      title: String(data.title ?? 'your event'),
      location_name: (data.locationName as string | null) ?? null,
      starts_at: String(data.startsAt ?? new Date().toISOString()),
    });
    return;
  }

  if (type === 'friend_request' || type === 'friend_accepted') {
    router.push('/friends');
    return;
  }

  // Post-event wrap targets (migration 032).
  if (type === 'wrap_ready' && eventId) {
    router.push(`/events/wrap/${eventId}`);
    return;
  }
  if ((type === 'photo_liked' || type === 'photo_commented') && eventId) {
    router.push(`/events/wrap/gallery/${eventId}`);
    return;
  }
  if (type === 'note_received') {
    // Sealed notes live at the top of the inbox Direct tab.
    router.push('/(tabs)/chats');
    return;
  }
  if (type === 'encore_requested' && eventId) {
    router.push(`/events/host/${eventId}`);
    return;
  }

  if (type === 'new_message' || type === 'mention' || type === 'host_announcement') {
    const friendId = data?.friendId ? String(data.friendId) : null;
    if (friendId) {
      router.push(`/(tabs)/chats/dm/${friendId}`);
      return;
    }
    if (eventId) {
      router.push(`/(tabs)/chats/${eventId}`);
      return;
    }
  }

  if (eventId && type && EVENT_SHEET_TYPES.has(type)) {
    // The focused tab screen picks this up and opens the event bottom sheet.
    useUIStore.getState().setSelectedEvent(eventId);
  }
}

export function useNotifications() {
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!userId) return;

    registerForPushNotifications(userId);

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        openNotificationTarget(
          response.notification.request.content.data as Record<string, unknown>
        );
      });

    // Live feed: whenever a notification row lands for this user, refresh the
    // notifications list + unread badge, and pop a banner from the top — the
    // Mello-styled in-app card while the app is open (InAppNotification in the
    // root layout), the system banner otherwise.
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        async (payload) => {
          const notif = payload.new as Notification;
          qc.invalidateQueries({ queryKey: queryKeys.notifications.of(userId) });
          qc.invalidateQueries({ queryKey: queryKeys.notificationsUnread.of(userId) });
          // The Inbox tab badge. A DM insert writes one of these rows via the
          // on_direct_message trigger, and this hook is the app's only
          // single-instance realtime listener — see useUnreadDms for why the
          // badge can't subscribe for itself.
          qc.invalidateQueries({ queryKey: queryKeys.unreadDms.of(userId) });

          let senderName: string | undefined;
          if (notif.sender_id) {
            const { data } = await supabase
              .from('profiles')
              .select('name')
              .eq('id', notif.sender_id)
              .single();
            senderName = data?.name;
          }
          const p = (notif.payload ?? {}) as Record<string, unknown>;
          const friendId = (p.friendId as string | undefined) ?? null;

          // Don't self-interrupt: skip the banner for a message in the chat the
          // user is already looking at (the message shows in the thread live).
          const activeChat = useUIStore.getState().activeChat;
          const chatKey = notif.event_id
            ? `event:${notif.event_id}`
            : friendId
              ? `dm:${friendId}`
              : null;
          const CHAT_TYPES = new Set(['new_message', 'mention', 'host_announcement']);
          if (CHAT_TYPES.has(notif.type) && chatKey && activeChat === chatKey) {
            return;
          }

          const { title, body } = notificationCopy(notif.type, {
            senderName,
            eventTitle: p.eventTitle as string | undefined,
            pending: p.pending as boolean | undefined,
            kind: p.kind as string | undefined,
            preview: p.preview as string | undefined,
          });
          const data = {
            type: notif.type,
            eventId: notif.event_id,
            friendId,
          };
          if (AppState.currentState === 'active') {
            useUIStore.getState().setInAppBanner({
              id: notif.id,
              type: notif.type,
              title,
              body,
              data,
            });
          } else {
            Notifications.scheduleNotificationAsync({
              content: { title, body, sound: 'default', data },
              trigger: null,
            });
          }
        }
      )
      .subscribe();

    return () => {
      responseListener.current?.remove();
      channel.unsubscribe();
    };
  }, [userId]);
}

// Asks for notification permission everywhere (banners need it even on the
// simulator); fetches and stores an Expo push token only on real hardware.
async function registerForPushNotifications(userId: string) {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  if (!Device.isDevice) return;

  // Getting an APNs/Expo push token needs the `aps-environment` entitlement,
  // which a locally `run:ios`-signed debug build does not carry — it throws
  // there, and because this whole function is fire-and-forget that surfaces as
  // an uncaught promise rejection (a redbox in dev). A transient APNs failure
  // would do the same. Push is best-effort: never let it take the app down, on
  // any build. The token just won't refresh until a build that has the
  // entitlement runs.
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as
      | string
      | undefined;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    await updatePushToken(userId, token.data);
  } catch (e) {
    console.warn('[push] token registration skipped:', e);
  }
}
