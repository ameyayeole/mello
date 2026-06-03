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
import { useAuthStore } from '@/stores/authStore';
import {
  getNotifications,
  markAllRead,
} from '@/services/notifications.service';
import { COLORS } from '@/constants/colors';
import { Notification } from '@/types/models';
import { relativeTime } from '@/utils/time';

const NOTIFICATION_ICONS: Record<string, string> = {
  friend_request: '👋',
  join_request: '🙋',
  event_update: '📣',
  new_message: '💬',
  event_starting_soon: '⏰',
  friend_joined_event: '🎉',
};

function NotifRow({ notif }: { notif: Notification }) {
  return (
    <View style={[styles.row, !notif.is_read && styles.rowUnread]}>
      <Text style={styles.icon}>
        {NOTIFICATION_ICONS[notif.type] ?? '🔔'}
      </Text>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>
          {notif.sender?.name ?? 'Someone'}
          {' '}
          {notif.type === 'friend_request' && 'sent you a friend request'}
          {notif.type === 'join_request' && 'joined your event'}
          {notif.type === 'new_message' && 'sent a message'}
          {notif.type === 'event_starting_soon' && 'Event starting soon!'}
          {notif.type === 'friend_joined_event' && 'joined an event with you'}
          {notif.type === 'event_update' && 'updated an event'}
        </Text>
        <Text style={styles.rowTime}>{relativeTime(notif.created_at)}</Text>
      </View>
      {!notif.is_read && <View style={styles.unreadDot} />}
    </View>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => getNotifications(user!.id),
    enabled: !!user,
  });

  const markAll = useMutation({
    mutationFn: () => markAllRead(user!.id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity onPress={() => markAll.mutate()}>
          <Text style={styles.markAll}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => <NotifRow notif={item} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔔</Text>
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  back: { fontSize: 22, color: COLORS.textPrimary },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  markAll: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },
  list: { padding: 16, gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginBottom: 8,
  },
  rowUnread: { backgroundColor: '#FFF0EF' },
  icon: { fontSize: 24, width: 36, textAlign: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 20 },
  rowTime: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyEmoji: { fontSize: 48 },
  emptyText: { fontSize: 16, color: COLORS.textSecondary },
});
