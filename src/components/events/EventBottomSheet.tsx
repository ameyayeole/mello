import {
  useRef,
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { queryKeys } from '@/constants/queryKeys';
import Animated, { FadeInUp, FadeOut } from 'react-native-reanimated';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetFooter,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  getEventDetail,
  getEventDistanceM,
  joinEvent,
  leaveEvent,
  approveParticipant,
  rejectParticipant,
  saveEvent,
  unsaveEvent,
} from '@/services/events.service';
import { useSavedEventIds } from '@/hooks/useSwipeDeck';
import { hasWrapped } from '@/services/wrap.service';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { CONFIG } from '@/constants/config';
import { isPremium, PREMIUM_GOLD, PREMIUM_GOLD_TINT } from '@/utils/premium';
import { EventDetail, ParticipantStatus } from '@/types/models';
import { ACTIVITY_MAP } from '@/constants/activities';
import { splitEventTime } from '@/utils/time';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
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
import { SafetyPopup } from '@/components/safety';
import {
  Avatar,
  AttendeeStack,
  Button,
  CategoryPill,
  Icon,
  IconName,
  PremiumBadge,
  PressableScale,
  SectionLabel,
  VerifiedBadge,
} from '@/components/ui';
import { categoryStyle } from '@/constants/categoryStyle';

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
      queryKey: queryKeys.eventDetail.of(eventId),
      queryFn: () => getEventDetail(eventId!),
      enabled: !!eventId,
    });

    const when = event ? splitEventTime(event.starts_at) : null;

    // Wishlist toggle for this event — the same save a right-swipe performs, so
    // both paths share the ['savedEventIds'] cache every badge reads.
    const [toast, setToast] = useState<string | null>(null);
    useEffect(() => {
      if (!toast) return;
      const t = setTimeout(() => setToast(null), 1900);
      return () => clearTimeout(t);
    }, [toast]);

    const { data: savedIds } = useSavedEventIds();
    const isSaved = !!eventId && !!savedIds?.includes(eventId);
    const saveMutation = useMutation({
      mutationFn: async (next: boolean) => {
        if (!user || !eventId) return;
        if (next) await saveEvent(user.id, eventId);
        else await unsaveEvent(user.id, eventId);
      },
      // Optimistic: the bookmark fills the instant it's tapped, then reconciles.
      onMutate: async (next: boolean) => {
        const key = queryKeys.savedEventIds.of(user?.id);
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData<string[]>(key);
        qc.setQueryData<string[]>(key, (ids = []) =>
          next ? [...ids, eventId!] : ids.filter((id) => id !== eventId)
        );
        return { prev, key };
      },
      onSuccess: (_d, next) => {
        setToast(next ? 'Added to wishlist' : 'Removed from wishlist');
      },
      // Previously this rolled back silently, which read as "the button does
      // nothing" — a failed save now says so instead of just snapping back.
      onError: (_e, _next, ctx) => {
        if (ctx) qc.setQueryData(ctx.key, ctx.prev);
        setToast("Couldn't update wishlist");
      },
      onSettled: () => {
        qc.invalidateQueries({ queryKey: queryKeys.savedEventIds.of(user?.id) });
        qc.invalidateQueries({ queryKey: queryKeys.savedEvents.of(user?.id) });
      },
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

    const detailKey = queryKeys.eventDetail.of(eventId);
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

    // Wishlist toast, pinned to the bottom of the VISIBLE sheet via the
    // library's footer (a hand-positioned absolute child sits in the sheet's
    // full-height inner container, which extends off-screen at partial snaps).
    // Must be identity-stable across unrelated re-renders: a fresh function
    // makes the footer remount, and reanimated then overlaps the exiting
    // snapshot with the entering one — a doubled toast.
    const renderToast = useCallback(
      (props: BottomSheetFooterProps) =>
        toast ? (
          <BottomSheetFooter {...props} bottomInset={24}>
            <Animated.View
              entering={FadeInUp.duration(200)}
              exiting={FadeOut.duration(160)}
              style={styles.toast}
              pointerEvents="none"
            >
              <Icon
                name="bookmarkFilled"
                size={15}
                color="#fff"
                strokeWidth={2}
              />
              <Text style={styles.toastText}>{toast}</Text>
            </Animated.View>
          </BottomSheetFooter>
        ) : null,
      [toast]
    );

    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={['58%', '90%']}
        enablePanDownToClose
        onClose={onDismiss}
        backgroundStyle={styles.sheetBg}
        handleComponent={null}
        footerComponent={renderToast}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content}>
          {isLoading || !event ? (
            <ActivityIndicator
              color={COLORS.primary}
              style={{ marginTop: 40 }}
            />
          ) : (
            <>
              {/* Photo banner: category pill + safety/share, grab handle over it */}
              <View style={styles.banner}>
                {event.image_url ? (
                  <Image
                    source={{ uri: event.image_url }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <Text style={styles.bannerHint}>EVENT PHOTO</Text>
                )}
                <View style={styles.grab} />
                <View style={styles.bannerPill}>
                  <CategoryPill
                    emoji={activity?.emoji ?? '📍'}
                    label={activity?.label}
                    color={categoryStyle(event.activity).accent}
                  />
                </View>
                <View style={styles.bannerActions}>
                  <PressableScale
                    scaleTo={0.9}
                    style={styles.shareBtn}
                    onPress={() => saveMutation.mutate(!isSaved)}
                    accessibilityLabel={
                      isSaved ? 'Remove from wishlist' : 'Add to wishlist'
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSaved }}
                  >
                    <Icon
                      name={isSaved ? 'bookmarkFilled' : 'bookmark'}
                      size={18}
                      color={COLORS.primary}
                      strokeWidth={2}
                    />
                  </PressableScale>
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
              </View>

              {/* Host row */}
              {event.host && (
                <View style={styles.hostRow}>
                  <Avatar
                    name={event.host.name}
                    photoUrl={event.host.photo_url}
                    size={34}
                  />
                  <View style={styles.hostNameRow}>
                    <Text style={styles.hostName} numberOfLines={1}>
                      {event.host.name}
                    </Text>
                    {event.host_verified && <VerifiedBadge size={14} />}
                    {isPremium(event.host) && <PremiumBadge size={13} />}
                    <Text style={styles.hostLabel}>is hosting</Text>
                  </View>
                  <View style={styles.goingWrap}>
                    <AttendeeStack
                      count={event.participant_count}
                      size={26}
                      emptyLabel={null}
                    />
                    {event.participant_count > 0 && (
                      <Text style={styles.goingText}>going</Text>
                    )}
                  </View>
                </View>
              )}

              <Text style={styles.title}>{event.title}</Text>

              {/* Date + location info cards */}
              <View style={styles.infoRow}>
                <View style={styles.infoCard}>
                  <Icon name="calendar" size={20} color={COLORS.primary} strokeWidth={2} />
                  <View style={styles.infoText}>
                    <Text style={styles.infoTitle} numberOfLines={1}>
                      {when?.dateShort}
                    </Text>
                    <Text style={styles.infoSub}>
                      {when?.timeShort}
                    </Text>
                  </View>
                </View>
                <View style={styles.infoCard}>
                  <Icon name="location" size={20} color={COLORS.primary} strokeWidth={2} />
                  <View style={styles.infoText}>
                    <Text style={styles.infoTitle} numberOfLines={1}>
                      {event.location_name ?? 'Location'}
                    </Text>
                    <Text style={styles.infoSub}>
                      {event.distance_m != null
                        ? `${formatDistance(event.distance_m)} away`
                        : 'Nearby'}
                    </Text>
                  </View>
                </View>
              </View>

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

              {event.description && (
                <Text style={styles.description}>{event.description}</Text>
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
                          color="rgba(0,0,0,0.55)"
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
                  <View style={styles.footerRow}>
                    {event.max_people != null && (
                      <View style={styles.spotsInfo}>
                        <Text style={styles.spotsCount}>
                          {event.participant_count}/{event.max_people}
                        </Text>
                        <Text style={styles.spotsLeft}>
                          {Math.max(event.max_people - event.participant_count, 0)}{' '}
                          spots left
                        </Text>
                      </View>
                    )}
                    <Button
                      style={{ flex: 1 }}
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
                      // Joining is the sheet's headline action, so it gets
                      // coral. Once you're in — or the event is closed to you —
                      // it drops to the low-emphasis treatment.
                      variant={
                        isParticipant || isPending || isFull || womenOnlyLocked
                          ? 'tertiary'
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
                  </View>
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
                    onPress={() => {
                      sheetRef.current?.close();
                      router.push(`/events/scan/${event.id}`);
                    }}
                  />
                )}

                {(isParticipant || isHost) && (
                  <Button
                    label="Open chat"
                    variant="tertiary"
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
    backgroundColor: COLORS.background,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
  },
  content: { padding: 20, paddingTop: 0, gap: 13 },
  banner: {
    height: 200,
    marginHorizontal: -20,
    marginBottom: 3,
    backgroundColor: '#E3E1E4',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerHint: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: COLORS.textMuted,
  },
  grab: {
    position: 'absolute',
    top: 12,
    width: 40,
    height: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  bannerPill: { position: 'absolute', top: 22, left: 16 },
  bannerActions: {
    position: 'absolute',
    top: 22,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: 24,
    lineHeight: 26,
    letterSpacing: -0.6,
    color: COLORS.textPrimary,
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hostNameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  hostName: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  hostLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: COLORS.textSecondary,
  },
  goingWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goingText: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    color: COLORS.textSecondary,
  },
  infoRow: { flexDirection: 'row', gap: 9 },
  infoCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: 14,
    padding: 11,
  },
  // Row children don't shrink by default, so without flex the text column
  // measures at full content width and spills past the card — long addresses
  // need this to ellipsize inside the tile instead of overflowing it.
  infoText: { flex: 1, minWidth: 0 },
  infoTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 12,
    color: COLORS.textPrimary,
  },
  infoSub: {
    fontFamily: FONTS.semibold,
    fontSize: 10.5,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  description: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    lineHeight: 21,
    color: '#5C5860',
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  spotsInfo: {},
  spotsCount: {
    fontFamily: FONTS.heading,
    fontSize: 20,
    color: COLORS.textPrimary,
  },
  spotsLeft: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 3,
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
  // Rendered inside BottomSheetFooter, which handles positioning — the style
  // only shapes the pill itself.
  toast: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 100,
    backgroundColor: COLORS.accent,
    shadowColor: '#0F182C',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  toastText: { fontFamily: FONTS.bold, fontSize: 13, color: '#fff' },
});
