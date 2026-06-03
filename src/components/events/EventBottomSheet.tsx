import { useRef, useState, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import BottomSheet, {
  BottomSheetView,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  getEventDetail,
  joinEvent,
  leaveEvent,
  approveParticipant,
  rejectParticipant,
} from '@/services/events.service';
import { useAuthStore } from '@/stores/authStore';
import { ACTIVITY_MAP } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { formatEventTime } from '@/utils/time';
import { formatDistance } from '@/utils/distance';

export interface EventBottomSheetRef {
  open: (eventId: string) => void;
  close: () => void;
}

interface Props {
  onDismiss?: () => void;
}

const EventBottomSheet = forwardRef<EventBottomSheetRef, Props>(
  ({ onDismiss }, ref) => {
    const sheetRef = useRef<BottomSheet>(null);
    // Must be state (not a ref) so changing the id re-renders and re-fires the query.
    const [eventId, setEventId] = useState<string | null>(null);
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const qc = useQueryClient();

    const { data: event, isLoading } = useQuery({
      queryKey: ['eventDetail', eventId],
      queryFn: () => getEventDetail(eventId!),
      enabled: !!eventId,
    });

    useImperativeHandle(ref, () => ({
      open(id: string) {
        setEventId(id);
        sheetRef.current?.snapToIndex(0);
      },
      close() {
        sheetRef.current?.close();
      },
    }));

    const isHost = event?.host_id === user?.id;
    const myStatus = event?.participants?.find((p) => p.id === user?.id)?.status;
    const isParticipant = myStatus === 'approved';
    const isPending = myStatus === 'pending';
    const isFull =
      event?.max_people != null &&
      (event.participant_count ?? 0) >= event.max_people;

    const approved = event?.participants?.filter((p) => p.status === 'approved') ?? [];
    const pending = event?.participants?.filter((p) => p.status === 'pending') ?? [];

    const invalidate = () =>
      qc.invalidateQueries({ queryKey: ['eventDetail', event?.id] });

    const joinMutation = useMutation({
      mutationFn: () =>
        joinEvent(event!.id, user!.id, event!.requires_approval),
      onSuccess: invalidate,
    });

    const leaveMutation = useMutation({
      mutationFn: () => leaveEvent(event!.id, user!.id),
      onSuccess: invalidate,
    });

    const approveMutation = useMutation({
      mutationFn: (uid: string) => approveParticipant(event!.id, uid),
      onSuccess: invalidate,
    });

    const rejectMutation = useMutation({
      mutationFn: (uid: string) => rejectParticipant(event!.id, uid),
      onSuccess: invalidate,
    });

    const activity = event ? ACTIVITY_MAP[event.activity] : null;

    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={['50%', '85%']}
        enablePanDownToClose
        onClose={onDismiss}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content}>
          {isLoading || !event ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.emoji}>{activity?.emoji}</Text>
                <View style={styles.headerText}>
                  <Text style={styles.title}>{event.title}</Text>
                  <Text style={styles.time}>{formatEventTime(event.starts_at)}</Text>
                </View>
                {event.distance_m != null && (
                  <Text style={styles.distance}>
                    {formatDistance(event.distance_m)}
                  </Text>
                )}
              </View>

              {event.location_name && (
                <Text style={styles.location}>📍 {event.location_name}</Text>
              )}

              {event.description && (
                <Text style={styles.description}>{event.description}</Text>
              )}

              <View style={styles.stats}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {event.participant_count}/{event.max_people ?? '∞'}
                  </Text>
                  <Text style={styles.statLabel}>People</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{activity?.label}</Text>
                  <Text style={styles.statLabel}>Activity</Text>
                </View>
              </View>

              {/* Approved participants avatars */}
              {approved.length > 0 && (
                <View style={styles.participantsRow}>
                  {approved.slice(0, 6).map((p) => (
                    <View key={p.id} style={styles.participantBubble}>
                      <Text style={styles.participantInitial}>
                        {p.name[0].toUpperCase()}
                      </Text>
                    </View>
                  ))}
                  {approved.length > 6 && (
                    <View style={styles.participantBubble}>
                      <Text style={styles.participantInitial}>
                        +{approved.length - 6}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Host: pending join requests to approve/reject */}
              {isHost && pending.length > 0 && (
                <View style={styles.pendingSection}>
                  <Text style={styles.pendingTitle}>
                    Requests to join ({pending.length})
                  </Text>
                  {pending.map((p) => (
                    <View key={p.id} style={styles.pendingRow}>
                      <View style={styles.pendingAvatar}>
                        <Text style={styles.participantInitial}>
                          {p.name[0].toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.pendingName}>{p.name}</Text>
                      <TouchableOpacity
                        style={styles.approveBtn}
                        onPress={() => approveMutation.mutate(p.id)}
                        disabled={approveMutation.isPending}
                      >
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rejectBtn}
                        onPress={() => rejectMutation.mutate(p.id)}
                        disabled={rejectMutation.isPending}
                      >
                        <Text style={styles.rejectBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Actions */}
              <View style={styles.actions}>
                {!isHost && (
                  <TouchableOpacity
                    style={[
                      styles.joinBtn,
                      (isParticipant || isPending || isFull) &&
                        styles.joinBtnSecondary,
                    ]}
                    onPress={() =>
                      isParticipant
                        ? leaveMutation.mutate()
                        : isPending
                        ? leaveMutation.mutate() // cancel pending request
                        : joinMutation.mutate()
                    }
                    disabled={
                      (isFull && !isParticipant && !isPending) ||
                      joinMutation.isPending ||
                      leaveMutation.isPending
                    }
                  >
                    <Text
                      style={[
                        styles.joinBtnText,
                        (isParticipant || isPending || isFull) &&
                          styles.joinBtnTextSecondary,
                      ]}
                    >
                      {isParticipant
                        ? 'Leave Event'
                        : isPending
                        ? 'Request Pending — Tap to Cancel'
                        : isFull
                        ? 'Event Full'
                        : event.requires_approval
                        ? 'Request to Join'
                        : 'Join Event'}
                    </Text>
                  </TouchableOpacity>
                )}

                {(isParticipant || isHost) && (
                  <TouchableOpacity
                    style={styles.chatBtn}
                    onPress={() => {
                      sheetRef.current?.close();
                      router.push(`/(tabs)/chats/${event.id}`);
                    }}
                  >
                    <Text style={styles.chatBtnText}>💬 Open Chat</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    );
  }
);

export default EventBottomSheet;

const styles = StyleSheet.create({
  sheetBg: { backgroundColor: COLORS.surface, borderRadius: 24 },
  handle: { backgroundColor: COLORS.border, width: 40 },
  content: { padding: 24, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 36 },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
  time: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  distance: { fontSize: 14, color: COLORS.primary, fontWeight: '700' },
  location: { fontSize: 14, color: COLORS.textSecondary },
  description: {
    fontSize: 15,
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  stats: { flexDirection: 'row', gap: 24 },
  stat: { alignItems: 'center' },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  statLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  participantsRow: { flexDirection: 'row', gap: 8 },
  participantBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantInitial: { color: '#fff', fontWeight: '700', fontSize: 14 },
  pendingSection: { gap: 8, marginTop: 4 },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 8,
  },
  pendingAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingName: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  approveBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
  },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  rejectBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtnText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  actions: { gap: 10 },
  joinBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  joinBtnSecondary: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.primary },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  joinBtnTextSecondary: { color: COLORS.primary },
  chatBtn: {
    backgroundColor: COLORS.background,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chatBtnText: { color: COLORS.textPrimary, fontWeight: '600', fontSize: 15 },
});
