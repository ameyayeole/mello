import { useRef, useState, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  getEventDetail,
  getEventDistanceM,
  joinEvent,
  leaveEvent,
  approveParticipant,
  rejectParticipant,
} from '@/services/events.service';
import { hasWrapped } from '@/services/wrap.service';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { CONFIG } from '@/constants/config';
import { isPremium, PREMIUM_GOLD, PREMIUM_GOLD_TINT } from '@/utils/premium';
import { EventDetail, ParticipantStatus } from '@/types/models';
import { ACTIVITY_MAP } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { formatEventTime } from '@/utils/time';
import { formatDistance } from '@/utils/distance';
import { shareEvent } from '@/utils/shareEvent';
import {
  hasSeenSafetyFlag,
  markSafetyFlagSeen,
  isNewHost,
  isPartyActivity,
} from '@/services/safety';
import {
  scheduleEventSafetyReminder,
  cancelEventSafetyReminder,
} from '@/services/reminders';
import { SafetyPopup, SosButton } from '@/components/safety';
import {
  Avatar,
  Button,
  CategoryTile,
  Icon,
  IconName,
  PremiumBadge,
  PressableScale,
  SectionLabel,
} from '@/components/ui';

// A safety popup queued to show before a join goes through (spec #3/#5/#8/#10).
// Confirming one marks its flag seen and shows the next; the join fires only
// after the whole queue is confirmed. Dismissing cancels the join.
interface QueuedSafetyPopup {
  flag: string;
  title: string;
  body: string | string[];
  primaryLabel: string;
  icon?: IconName;
  accent?: string;
  tint?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

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

    // Distance user↔event for the Mello+ >10 km join gate. The detail query
    // can't provide it (no lat/lng in SELECT *); fails soft to "no gate" when
    // location is off or migration 024 isn't applied yet.
    const coords = useLocationStore((s) => s.coords);
    const { data: gateDistanceM } = useQuery({
      queryKey: ['eventDistance', eventId],
      queryFn: () => getEventDistanceM(eventId!, coords!),
      enabled: !!eventId && !!coords,
      staleTime: 5 * 60_000,
      retry: 1,
    });

    const premiumUser = isPremium(user);
    const tooFar =
      !premiumUser &&
      gateDistanceM != null &&
      gateDistanceM > CONFIG.freeJoinRadiusMeters;

    useImperativeHandle(ref, () => ({
      open(id: string) {
        setEventId(id);
        // On a cold start (opened from a deep link) the sheet isn't laid out
        // yet when this fires, so an immediate snapToIndex is silently dropped.
        // Retry across a few frames; snapping again once open is a no-op.
        let tries = 0;
        const snap = () => {
          sheetRef.current?.snapToIndex(0);
          if (tries++ < 5) requestAnimationFrame(snap);
        };
        requestAnimationFrame(snap);
      },
      close() {
        sheetRef.current?.close();
      },
    }));

    const isHost = event?.host_id === user?.id;
    const myStatus = event?.participants?.find(
      (p) => p.id === user?.id
    )?.status;
    const isParticipant = myStatus === 'approved';
    const isPending = myStatus === 'pending';
    const isFull =
      event?.max_people != null &&
      (event.participant_count ?? 0) >= event.max_people;
    // RLS already hides women-only events from non-female viewers; this is a
    // client-side belt-and-braces for anything fetched by direct id.
    const womenOnlyLocked =
      !!event?.women_only && !isHost && user?.gender !== 'female';

    const approved =
      event?.participants?.filter((p) => p.status === 'approved') ?? [];
    // Mello+ members' requests surface first for the host.
    const pending = (
      event?.participants?.filter((p) => p.status === 'pending') ?? []
    ).sort((a, b) => Number(isPremium(b)) - Number(isPremium(a)));

    const detailKey = ['eventDetail', eventId] as const;
    const invalidate = () => qc.invalidateQueries({ queryKey: detailKey });

    // Optimistic cache helpers — patch the eventDetail so the UI (button label,
    // participant list, count) updates the instant a button is tapped, before
    // the Supabase round-trip. onError rolls the snapshot back if it fails.
    const setMyParticipation = (status: ParticipantStatus | null) => {
      qc.setQueryData<EventDetail>(detailKey, (prev) => {
        if (!prev || !user) return prev;
        const others = prev.participants.filter((p) => p.id !== user.id);
        const participants = status
          ? [...others, { ...user, status }]
          : others;
        return {
          ...prev,
          participants,
          participant_count: participants.filter(
            (p) => p.status === 'approved'
          ).length,
        };
      });
    };

    const patchParticipant = (
      uid: string,
      status: ParticipantStatus | null
    ) => {
      qc.setQueryData<EventDetail>(detailKey, (prev) => {
        if (!prev) return prev;
        const participants =
          status === null
            ? prev.participants.filter((p) => p.id !== uid)
            : prev.participants.map((p) =>
                p.id === uid ? { ...p, status } : p
              );
        return {
          ...prev,
          participants,
          participant_count: participants.filter(
            (p) => p.status === 'approved'
          ).length,
        };
      });
    };

    const joinMutation = useMutation({
      mutationFn: () => joinEvent(event!.id, user!.id, event!.requires_approval),
      onMutate: () => {
        const prev = qc.getQueryData<EventDetail>(detailKey);
        setMyParticipation(event!.requires_approval ? 'pending' : 'approved');
        return { prev };
      },
      onError: (_e, _v, ctx) => {
        if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
        Alert.alert("Couldn't join", 'Please check your connection and try again.');
      },
      onSuccess: () => {
        // Pre-event safety reminder (#4). Pending requests get no reminder —
        // the host may never approve them.
        if (event && !event.requires_approval) {
          scheduleEventSafetyReminder(event);
        }
      },
      onSettled: invalidate,
    });

    const leaveMutation = useMutation({
      mutationFn: () => leaveEvent(event!.id, user!.id),
      onMutate: () => {
        const prev = qc.getQueryData<EventDetail>(detailKey);
        setMyParticipation(null);
        return { prev };
      },
      onError: (_e, _v, ctx) => {
        if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
      },
      onSuccess: () => {
        if (event) cancelEventSafetyReminder(event.id);
      },
      onSettled: invalidate,
    });

    // ─── Pre-join safety queue (#3 first join, #10 women-only, #5 new host,
    //     #8 party/alcohol) ────────────────────────────────────────────────────
    const [joinQueue, setJoinQueue] = useState<QueuedSafetyPopup[]>([]);

    async function handleJoinPress() {
      if (!event || !user) return;

      // Beyond the free 10 km radius: browsing is fine, joining needs Mello+.
      if (tooFar) {
        router.push('/premium?reason=distance');
        return;
      }

      const queue: QueuedSafetyPopup[] = [];

      if (!(await hasSeenSafetyFlag(user.id, 'first_join'))) {
        queue.push({
          flag: 'first_join',
          icon: 'parties',
          title: 'Nice — your first Mello 🎉',
          body: [
            'Meet in public the first time.',
            "Tell a friend where you're going.",
            "Check the host's profile and reviews.",
            'If anything feels off, leave and report — no explanation needed.',
          ],
          primaryLabel: 'Count me in',
        });
      }

      if (
        event.women_only &&
        !(await hasSeenSafetyFlag(user.id, `women_event.${event.id}`))
      ) {
        queue.push({
          flag: `women_event.${event.id}`,
          icon: 'heart',
          accent: '#7C5CE0',
          tint: '#F0ECFC',
          title: 'A space for women',
          body:
            'This event is for women only. If anyone makes you ' +
            'uncomfortable you can leave, block and report — ' +
            "women's-safety reports are reviewed as a priority.",
          primaryLabel: 'Join',
        });
      }

      if (
        isNewHost(event.host?.created_at) &&
        !(await hasSeenSafetyFlag(user.id, `new_host.${event.host_id}`))
      ) {
        queue.push({
          flag: `new_host.${event.host_id}`,
          icon: 'shieldAlert',
          accent: '#C8791E',
          tint: '#FBF0E2',
          title: 'A quick heads-up',
          body:
            "This host is fairly new to Mello. That's not necessarily a " +
            'problem — just take a little extra care: meet in public, bring ' +
            'a friend, and keep personal details to yourself.',
          primaryLabel: 'Got it, join anyway',
          secondaryLabel: 'View host profile',
          onSecondary: () => {
            setJoinQueue([]);
            sheetRef.current?.close();
            router.push(`/friends/${event.host_id}`);
          },
        });
      }

      if (
        isPartyActivity(event.activity) &&
        !(await hasSeenSafetyFlag(user.id, `party.${event.id}`))
      ) {
        queue.push({
          flag: `party.${event.id}`,
          icon: 'drinks',
          accent: '#D6478E',
          tint: '#FBE7F1',
          title: 'Have a great night — stay in control',
          body: [
            'Know your limit and plan your way home.',
            "Watch your drink — don't accept opened drinks.",
            'Consent always matters. "No" is a full answer.',
            'Look out for each other.',
          ],
          primaryLabel: 'Got it',
        });
      }

      if (queue.length > 0) setJoinQueue(queue);
      else joinMutation.mutate();
    }

    // Confirming the current popup marks it seen; the join fires once the
    // queue is empty.
    function confirmQueuedPopup() {
      const current = joinQueue[0];
      if (current && user) markSafetyFlagSeen(user.id, current.flag);
      const rest = joinQueue.slice(1);
      setJoinQueue(rest);
      if (rest.length === 0) joinMutation.mutate();
    }

    const approveMutation = useMutation({
      mutationFn: (uid: string) => approveParticipant(event!.id, uid),
      onMutate: (uid: string) => {
        const prev = qc.getQueryData<EventDetail>(detailKey);
        patchParticipant(uid, 'approved');
        return { prev };
      },
      onError: (_e, _v, ctx) => {
        if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
      },
      onSettled: invalidate,
    });

    const rejectMutation = useMutation({
      mutationFn: (uid: string) => rejectParticipant(event!.id, uid),
      onMutate: (uid: string) => {
        const prev = qc.getQueryData<EventDetail>(detailKey);
        patchParticipant(uid, null);
        return { prev };
      },
      onError: (_e, _v, ctx) => {
        if (ctx?.prev) qc.setQueryData(detailKey, ctx.prev);
      },
      onSettled: invalidate,
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
            <ActivityIndicator
              color={COLORS.primary}
              style={{ marginTop: 40 }}
            />
          ) : (
            <>
              {/* Safety + share live top-left as icons (not bottom pills). */}
              <View style={styles.headerActions}>
                <SosButton
                  variant="icon"
                  event={event}
                  onReport={() => {
                    sheetRef.current?.close();
                    router.push(`/friends/${event.host_id}`);
                  }}
                />
                <PressableScale
                  scaleTo={0.9}
                  style={styles.shareBtn}
                  onPress={() => shareEvent(event)}
                  accessibilityLabel="Share this event"
                  accessibilityRole="button"
                >
                  <Icon name="share" size={18} color={COLORS.primary} strokeWidth={2} />
                </PressableScale>
              </View>

              {event.image_url && (
                <Image
                  source={{ uri: event.image_url }}
                  style={styles.cover}
                  contentFit="cover"
                  transition={200}
                />
              )}

              {/* Title row */}
              <View style={styles.header}>
                <CategoryTile activity={event.activity} size={44} radius={13} />
                <View style={styles.headerText}>
                  <Text style={styles.title}>{event.title}</Text>
                  <View style={styles.metaRow}>
                    <Icon name="clock" size={13} color="rgba(15,24,44,0.6)" />
                    <Text style={styles.metaText}>
                      {formatEventTime(event.starts_at)}
                    </Text>
                    {event.distance_m != null && (
                      <Text style={styles.distance}>
                        · {formatDistance(event.distance_m)}
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              {event.location_name && (
                <View style={styles.locationRow}>
                  <Icon name="location" size={15} color={COLORS.primary} />
                  <Text style={styles.location} numberOfLines={1}>
                    {event.location_name}
                  </Text>
                </View>
              )}

              {tooFar && !isParticipant && !isPending && (
                <View style={styles.premiumPill}>
                  <Icon name="crown" size={13} color={PREMIUM_GOLD} strokeWidth={2} />
                  <Text style={styles.premiumPillText}>
                    Beyond your 10 km — join with Mello+
                  </Text>
                </View>
              )}

              {event.women_only && (
                <View style={styles.womenOnlyPill}>
                  <Icon name="user" size={13} color={COLORS.secondary} strokeWidth={2} />
                  <Text style={styles.womenOnlyText}>Female-only event</Text>
                </View>
              )}

              {/* Host */}
              {event.host && (
                <View style={styles.hostRow}>
                  <Avatar
                    name={event.host.name}
                    photoUrl={event.host.photo_url}
                    size={38}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hostLabel}>Hosted by</Text>
                    <View style={styles.hostNameRow}>
                      <Text style={styles.hostName}>{event.host.name}</Text>
                      {isPremium(event.host) && <PremiumBadge size={13} />}
                    </View>
                  </View>
                  <View style={styles.spotsPill}>
                    <Text style={styles.spotsPillText}>
                      {event.participant_count}
                      {event.max_people ? `/${event.max_people}` : ''} going
                    </Text>
                  </View>
                </View>
              )}

              {event.description && (
                <View style={styles.promptCard}>
                  <Text style={styles.promptLabel}>What's the plan</Text>
                  <Text style={styles.description}>{event.description}</Text>
                </View>
              )}

              {/* Approved participants stack */}
              {approved.length > 0 && (
                <View>
                  <SectionLabel style={styles.sectionLabel}>
                    Who's going
                  </SectionLabel>
                  <View style={styles.participantsRow}>
                    {approved.slice(0, 6).map((p, i) => (
                      <View
                        key={p.id}
                        style={[styles.stackItem, i > 0 && { marginLeft: -11 }]}
                      >
                        <Avatar name={p.name} photoUrl={p.photo_url} size={34} />
                      </View>
                    ))}
                    {approved.length > 6 && (
                      <View style={[styles.overflowBubble, { marginLeft: -11 }]}>
                        <Text style={styles.overflowText}>
                          +{approved.length - 6}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Host: pending join requests to approve/reject */}
              {isHost && pending.length > 0 && (
                <View style={styles.pendingSection}>
                  <SectionLabel style={styles.sectionLabel}>
                    Requests · {pending.length}
                  </SectionLabel>
                  {pending.map((p) => (
                    <View key={p.id} style={styles.pendingRow}>
                      <Avatar name={p.name} photoUrl={p.photo_url} size={38} />
                      <View style={styles.pendingNameWrap}>
                        <Text style={styles.pendingName} numberOfLines={1}>
                          {p.name}
                        </Text>
                        {isPremium(p) && <PremiumBadge size={13} />}
                      </View>
                      <PressableScale
                        scaleTo={0.92}
                        style={styles.approveBtn}
                        onPress={() => approveMutation.mutate(p.id)}
                        disabled={approveMutation.isPending}
                      >
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </PressableScale>
                      <PressableScale
                        scaleTo={0.92}
                        style={styles.rejectBtn}
                        onPress={() => rejectMutation.mutate(p.id)}
                        disabled={rejectMutation.isPending}
                        accessibilityLabel="Decline request"
                      >
                        <Icon
                          name="close"
                          size={16}
                          color="rgba(15,24,44,0.55)"
                          strokeWidth={2}
                        />
                      </PressableScale>
                    </View>
                  ))}
                </View>
              )}

              {/* Actions */}
              <View style={styles.actions}>
                {/* Ended event + attendee: the wrap replaces join/leave. */}
                {hasWrapped(event) && (isParticipant || isHost) && (
                  <Button
                    label="Open the event wrap"
                    onPress={() => {
                      sheetRef.current?.close();
                      router.push(`/events/wrap/${event.id}`);
                    }}
                  />
                )}

                {!isHost && !hasWrapped(event) && (
                  <Button
                    label={
                      isParticipant
                        ? 'Leave event'
                        : isPending
                          ? 'Request pending'
                          : womenOnlyLocked
                            ? 'Female-only event'
                            : isFull
                              ? 'Event full'
                              : tooFar
                                ? 'Join with Mello+'
                                : event.requires_approval
                                  ? 'Request to join'
                                  : 'Join event'
                    }
                    variant={
                      isParticipant || isPending || isFull || womenOnlyLocked
                        ? 'secondary'
                        : 'primary'
                    }
                    onPress={() =>
                      isParticipant || isPending
                        ? leaveMutation.mutate()
                        : handleJoinPress()
                    }
                    disabled={
                      ((isFull || womenOnlyLocked) &&
                        !isParticipant &&
                        !isPending) ||
                      joinMutation.isPending ||
                      leaveMutation.isPending
                    }
                  />
                )}

                {isHost && (
                  <Button
                    label="Manage event"
                    onPress={() => {
                      sheetRef.current?.close();
                      router.push(`/events/host/${event.id}`);
                    }}
                  />
                )}

                {/* Approved guest of a live/upcoming event: scan to check in. */}
                {isParticipant && !hasWrapped(event) && (
                  <Button
                    label="Check in"
                    variant="secondary"
                    onPress={() => {
                      sheetRef.current?.close();
                      router.push(`/events/scan/${event.id}`);
                    }}
                  />
                )}

                {(isParticipant || isHost) && (
                  <Button
                    label="Open chat"
                    variant="secondary"
                    onPress={() => {
                      sheetRef.current?.close();
                      router.push(`/(tabs)/chats/${event.id}`);
                    }}
                  />
                )}
              </View>
            </>
          )}
        </BottomSheetScrollView>

        {/* Pre-join safety popups, one at a time. Dismissing cancels the join. */}
        {joinQueue.length > 0 && (
          <SafetyPopup
            visible
            icon={joinQueue[0].icon}
            accent={joinQueue[0].accent}
            tint={joinQueue[0].tint}
            title={joinQueue[0].title}
            body={joinQueue[0].body}
            primaryLabel={joinQueue[0].primaryLabel}
            onPrimary={confirmQueuedPopup}
            secondaryLabel={joinQueue[0].secondaryLabel}
            onSecondary={joinQueue[0].onSecondary}
            onClose={() => setJoinQueue([])}
          />
        )}
      </BottomSheet>
    );
  }
);

export default EventBottomSheet;

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
  },
  handle: {
    backgroundColor: 'rgba(15,24,44,0.15)',
    width: 40,
    height: 5,
    borderRadius: 100,
  },
  content: { padding: 20, paddingTop: 8, gap: 14 },
  cover: { width: '100%', height: 180, borderRadius: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    lineHeight: 24,
    color: COLORS.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  metaText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: 'rgba(15,24,44,0.6)',
  },
  distance: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.primary,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  location: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: COLORS.textPrimary,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.background,
    borderRadius: 14,
    padding: 10,
  },
  hostLabel: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: COLORS.textSecondary,
  },
  hostNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  hostName: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  spotsPill: {
    backgroundColor: 'rgba(31,164,99,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  spotsPillText: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    color: COLORS.success,
  },
  promptCard: {
    backgroundColor: COLORS.background,
    borderRadius: 14,
    padding: 14,
  },
  promptLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: 'rgba(15,24,44,0.5)',
  },
  description: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textPrimary,
    marginTop: 5,
  },
  sectionLabel: { marginBottom: 8 },
  participantsRow: { flexDirection: 'row', alignItems: 'center' },
  stackItem: {
    borderRadius: 19,
    borderWidth: 2.5,
    borderColor: COLORS.surface,
  },
  overflowBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primaryTint,
    borderWidth: 2.5,
    borderColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowText: {
    fontFamily: FONTS.heavy,
    fontSize: 12,
    color: COLORS.primary,
  },
  pendingSection: { gap: 8 },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.background,
    borderRadius: 14,
    padding: 10,
  },
  pendingNameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pendingName: {
    flexShrink: 1,
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  approveBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: { fontFamily: FONTS.bold, color: '#fff', fontSize: 12.5 },
  rejectBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F0F1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { gap: 10, marginTop: 4 },
  premiumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: PREMIUM_GOLD_TINT,
  },
  premiumPillText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: PREMIUM_GOLD,
  },
  womenOnlyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: 'rgba(149,9,82,0.10)',
  },
  womenOnlyText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.secondary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
  },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
