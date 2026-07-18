import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import {
  getNotifications,
  markAllRead,
  markRead,
} from '@/services/notifications.service';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Notification } from '@/types/models';
import { relativeTime } from '@/utils/time';
import { Icon, IconButton, IconName, SectionLabel } from '@/components/ui';
import { NOTIFICATION_ICONS } from '@/constants/notificationStyle';

function notifText(notif: Notification): React.ReactNode {
  const name = notif.sender?.name ?? 'Someone';
  switch (notif.type) {
    case 'join_approved':
      return (
        <>
          Your request to join{' '}
          <Text style={styles.bold}>
            {(notif.payload as any)?.eventTitle ?? 'the event'}
          </Text>{' '}
          was approved 🎉
        </>
      );
    case 'friend_request':
      return (
        <>
          <Text style={styles.bold}>{name}</Text> sent you a friend request
        </>
      );
    case 'friend_accepted':
      return (
        <>
          <Text style={styles.bold}>{name}</Text> accepted your friend request
          🎉
        </>
      );
    case 'join_request':
      return (
        <>
          <Text style={styles.bold}>{name}</Text>{' '}
          {(notif.payload as any)?.pending
            ? 'requested to join your event'
            : 'joined your event'}
        </>
      );
    case 'new_message':
      return (
        <>
          <Text style={styles.bold}>{name}</Text> sent a message
        </>
      );
    case 'event_starting_soon':
      return <>Reminder: your event is starting soon</>;
    case 'friend_joined_event':
      return (
        <>
          <Text style={styles.bold}>{name}</Text> joined an event with you
        </>
      );
    case 'event_update':
      return (
        <>
          <Text style={styles.bold}>{name}</Text> updated an event
        </>
      );
    case 'event_boosted':
      return (
        <>
          🔥{' '}
          <Text style={styles.bold}>
            {(notif.payload as any)?.eventTitle ?? 'An event'}
          </Text>{' '}
          you wishlisted just got boosted
        </>
      );
    case 'wrap_ready':
      return (
        <>
          How was{' '}
          <Text style={styles.bold}>
            {(notif.payload as any)?.eventTitle ?? 'your event'}
          </Text>
          ? The wrap is ready 📸
        </>
      );
    case 'note_received':
      return (
        <>
          💌 Someone from{' '}
          <Text style={styles.bold}>
            {(notif.payload as any)?.eventTitle ?? 'your event'}
          </Text>{' '}
          left you a note
        </>
      );
    case 'photo_liked':
      return (
        <>
          <Text style={styles.bold}>{name}</Text> liked your photo
        </>
      );
    case 'photo_commented':
      return (
        <>
          <Text style={styles.bold}>{name}</Text> commented on your photo
        </>
      );
    case 'encore_requested':
      return (
        <>
          🔁 People want you to run{' '}
          <Text style={styles.bold}>
            {(notif.payload as any)?.eventTitle ?? 'your event'}
          </Text>{' '}
          back
        </>
      );
    default:
      return <Text style={styles.bold}>{name}</Text>;
  }
}

function NotifRow({
  notif,
  index,
  onPress,
}: {
  notif: Notification;
  index: number;
  onPress: (notif: Notification) => void;
}) {
  const style = NOTIFICATION_ICONS[notif.type] ?? {
    icon: 'bell' as IconName,
    color: COLORS.primary,
    tint: COLORS.primaryTint,
  };
  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 10) * 40).duration(300)}
    >
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onPress(notif)}
        style={[styles.row, !notif.is_read && styles.rowUnread]}
      >
        <View style={[styles.iconCircle, { backgroundColor: style.tint }]}>
          <Icon name={style.icon} size={20} color={style.color} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{notifText(notif)}</Text>
          <Text style={styles.rowTime}>{relativeTime(notif.created_at)}</Text>
        </View>
        {!notif.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    </Animated.View>
  );
}

type ListItem =
  | { kind: 'header'; label: string; id: string }
  | { kind: 'notif'; notif: Notification; id: string };

export default function NotificationsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => getNotifications(user!.id),
    enabled: !!user,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notifications', user?.id] });
    qc.invalidateQueries({ queryKey: ['notificationsUnread', user?.id] });
  };

  const markAll = useMutation({
    mutationFn: () => markAllRead(user!.id),
    onSuccess: invalidate,
  });

  const markOne = useMutation({
    mutationFn: (id: string) => markRead(id),
    onSuccess: invalidate,
  });

  // Tapping a notification marks it read and jumps to what it's about:
  // event-related ones open the event card (bottom sheet on the tab
  // underneath), friend ones open the friends screen, messages open the chat.
  const onPressNotif = (notif: Notification) => {
    if (!notif.is_read) markOne.mutate(notif.id);

    switch (notif.type) {
      case 'friend_request':
      case 'friend_accepted':
        router.back();
        router.push('/friends');
        return;
      case 'new_message': {
        const friendId = (notif.payload as any)?.friendId as string | undefined;
        if (friendId) {
          router.back();
          router.push(`/(tabs)/chats/dm/${friendId}`);
          return;
        }
        if (notif.event_id) {
          router.back();
          router.push(`/(tabs)/chats/${notif.event_id}`);
          return;
        }
        break;
      }
      case 'wrap_ready':
        if (notif.event_id) {
          router.push(`/events/wrap/${notif.event_id}`);
          return;
        }
        break;
      case 'photo_liked':
      case 'photo_commented':
        if (notif.event_id) {
          router.push(`/events/wrap/gallery/${notif.event_id}`);
          return;
        }
        break;
      case 'note_received':
        router.back();
        router.push('/(tabs)/chats');
        return;
      case 'encore_requested':
        if (notif.event_id) {
          router.push(`/events/host/${notif.event_id}`);
          return;
        }
        break;
      default:
        break;
    }

    if (notif.event_id) {
      useUIStore.getState().setSelectedEvent(notif.event_id);
      router.back();
    }
  };

  const unread = (notifications ?? []).filter((n) => !n.is_read);
  const read = (notifications ?? []).filter((n) => n.is_read);
  const items: ListItem[] = [
    ...(unread.length
      ? [{ kind: 'header' as const, label: 'New', id: 'h-new' }]
      : []),
    ...unread.map((n) => ({ kind: 'notif' as const, notif: n, id: n.id })),
    ...(read.length
      ? [{ kind: 'header' as const, label: 'Earlier', id: 'h-earlier' }]
      : []),
    ...read.map((n) => ({ kind: 'notif' as const, notif: n, id: n.id })),
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="close"
          variant="ghost"
          onPress={() => router.back()}
          accessibilityLabel="Close"
        />
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity onPress={() => markAll.mutate()} hitSlop={8}>
          <Text style={styles.markAll}>Mark all</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) =>
            item.kind === 'header' ? (
              <SectionLabel style={styles.sectionLabel}>
                {item.label}
              </SectionLabel>
            ) : (
              <NotifRow
                notif={item.notif}
                index={index}
                onPress={onPressNotif}
              />

            )
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Icon name="bell" size={38} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>You're all caught up</Text>
              <Text style={styles.emptyText}>
                RSVP updates, messages and reminders land here.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: {
    flex: 1,
    fontFamily: FONTS.heavy,
    fontSize: 22,
    letterSpacing: -0.44,
    color: COLORS.textPrimary,
  },
  markAll: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.primary,
  },
  sectionLabel: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  list: { paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  rowUnread: { backgroundColor: '#FFF6F5' },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    lineHeight: 18,
    color: 'rgba(15,24,44,0.85)',
  },
  bold: { fontFamily: FONTS.bold, color: COLORS.textPrimary },
  rowTime: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: 'rgba(15,24,44,0.4)',
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: 6,
  },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 240,
  },
});
