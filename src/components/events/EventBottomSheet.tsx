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
} from 'react-native';
import { Image } from 'expo-image';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import Animated, { FadeInUp, FadeOut } from 'react-native-reanimated';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetFooter,
  BottomSheetBackdrop,
  type BottomSheetFooterProps,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  getEventDetail,
  getEventDistanceM,
  saveEvent,
  unsaveEvent,
} from '@/services/events.service';
import { useSavedEventIds } from '@/hooks/useSwipeDeck';
import { hasWrapped } from '@/services/wrap.service';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { CONFIG } from '@/constants/config';
import { isPremium, PREMIUM_GOLD, PREMIUM_GOLD_TINT } from '@/utils/premium';
import { ACTIVITY_MAP } from '@/constants/activities';
import { useEventParticipation } from '@/hooks/useEventParticipation';
import { splitEventTime } from '@/utils/time';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatDistance } from '@/utils/distance';
import { neighbourhood } from '@/utils/location';
import { shareEvent } from '@/utils/shareEvent';
import {
  hasSeenSafetyFlag,
  markSafetyFlagSeen,
  isNewHost,
  isPartyActivity,
} from '@/services/safety';
import { SafetyPopup } from '@/components/safety';
import {
  Avatar,
  AttendeeStack,
  Button,
  CategoryPill,
  Dialog,
  Glass,
  Icon,
  IconName,
  PremiumBadge,
  PressableScale,
  SectionLabel,
  Sheet,
  TextField,
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

// The reasons offered when leaving. Stored verbatim in event_leave_feedback so a
// host can see why guests dropped. "Something else" invites a free-text note.
const LEAVE_REASONS = [
  "Can't make it anymore",
  'My plans changed',
  'Not comfortable / feels unsafe',
  'Something else',
] as const;

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
        // The sheet is always mounted now (one instance in (tabs)/_layout), so
        // it is laid out by the time any tap or deep link calls this — a single
        // snap on the next frame is enough. The old retry-loop that snapped ~6×
        // per open was itself part of the expand jank.
        requestAnimationFrame(() => sheetRef.current?.snapToIndex(0));
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

    const { join, leave, approve, reject } = useEventParticipation(
      eventId,
      user ?? null,
      event
    );

    // ─── Pre-join safety queue (#3 first join, #10 women-only, #5 new host,
    //     #8 party/alcohol) ────────────────────────────────────────────────────
    const [joinQueue, setJoinQueue] = useState<QueuedSafetyPopup[]>([]);

    // ─── Leave flow: confirm → reason (spec: "are you sure?" then a reason) ─────
    // Leaving is two-step and the reason is recorded (event_leave_feedback). The
    // reason picker only opens after the confirm, so an accidental tap can't
    // remove you.
    const [leaveStep, setLeaveStep] = useState<'idle' | 'confirm' | 'reason'>(
      'idle'
    );
    const [leaveReason, setLeaveReason] = useState<string | null>(null);
    const [leaveDetail, setLeaveDetail] = useState('');

    function resetLeaveFlow() {
      setLeaveStep('idle');
      setLeaveReason(null);
      setLeaveDetail('');
    }

    function confirmLeave() {
      if (!leaveReason) return;
      leave.mutate({
        reason: leaveReason,
        detail: leaveDetail.trim() || undefined,
      });
      resetLeaveFlow();
      sheetRef.current?.close();
    }

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
      else join.mutate();
    }

    // Confirming the current popup marks it seen; the join fires once the
    // queue is empty.
    function confirmQueuedPopup() {
      const current = joinQueue[0];
      if (current && user) markSafetyFlagSeen(user.id, current.flag);
      const rest = joinQueue.slice(1);
      setJoinQueue(rest);
      if (rest.length === 0) join.mutate();
    }

    const activity = event ? ACTIVITY_MAP[event.activity] : null;

    // Wishlist toast, pinned to the bottom of the VISIBLE sheet via the
    // library's footer (a hand-positioned absolute child sits in the sheet's
    // full-height inner container, which extends off-screen at partial snaps).
    // Must be identity-stable across unrelated re-renders: a fresh function
    // makes the footer remount, and reanimated then overlaps the exiting
    // snapshot with the entering one — a doubled toast.
    // Dims the screen behind the sheet — including the floating tab bar, which
    // the sheet now sits above (mounted in (tabs)/_layout). Tapping the dim
    // closes. Identity-stable so the sheet doesn't remount it each render.
    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
        />
      ),
      []
    );

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
        // One tall snap: on first tap the primary action (Open chat / Join) is
        // already in view on every device, no scroll needed. A shorter first
        // stop hid it on smaller screens.
        snapPoints={['90%']}
        // Off: it defaults on in gorhom v5 and re-measures content against the
        // fixed snap point on every expand — the stutter after a scroll.
        enableDynamicSizing={false}
        enablePanDownToClose
        onClose={() => {
          resetLeaveFlow();
          onDismiss?.();
        }}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleComponent={null}
        footerComponent={renderToast}
      >
        <BottomSheetScrollView contentContainerStyle={styles.content}>
          {isLoading || !event ? (
            <ActivityIndicator
              color={COLORS.primary}
              style={{ marginTop: SPACING[10] }}
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
                {/* Frosted on-photo chips — the same treatment the other photo
                    cards use for their save/share buttons (see FeaturedPlanCard),
                    white glyphs on smoked glass so they read over any image. */}
                <View style={styles.bannerActions}>
                  <PressableScale
                    scaleTo={0.9}
                    onPress={() => saveMutation.mutate(!isSaved)}
                    accessibilityLabel={
                      isSaved ? 'Remove from wishlist' : 'Add to wishlist'
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSaved }}
                  >
                    <Glass tier="onPhoto" radius={RADIUS.md} style={styles.chip}>
                      <Icon
                        name={isSaved ? 'bookmarkFilled' : 'bookmark'}
                        size={18}
                        color={COLORS.white}
                        strokeWidth={2}
                      />
                    </Glass>
                  </PressableScale>
                  <PressableScale
                    scaleTo={0.9}
                    onPress={() => shareEvent(event)}
                    accessibilityLabel="Share this event"
                    accessibilityRole="button"
                  >
                    <Glass tier="onPhoto" radius={RADIUS.md} style={styles.chip}>
                      <Icon name="share" size={18} color={COLORS.white} strokeWidth={2} />
                    </Glass>
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
                    ringColor={COLORS.white}
                    ringWidth={1.5}
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
                      people={event.participants.filter(
                        (p) => p.status === 'approved'
                      )}
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
                      {event.location_name
                        ? neighbourhood(event.location_name)
                        : 'Location'}
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
                        onPress={() => approve.mutate(p.id)}
                        disabled={approve.isPending}
                      >
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </PressableScale>
                      <PressableScale
                        scaleTo={0.92}
                        style={styles.rejectBtn}
                        onPress={() => reject.mutate(p.id)}
                        disabled={reject.isPending}
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

              {/* Actions.
                  Order for someone who's in: Open chat → Check in → who's-going
                  card → Leave (last, behind a confirm). The host is a participant
                  since migration 043, so `isParticipant` is true for them too —
                  guard the guest-only actions (Check in, Leave) with `!isHost`. */}
              <View style={styles.actions}>
                {/* Ended event: attendees get the wrap. Nobody gets join/leave/
                    check-in on a finished event — those only exist below, guarded
                    by !hasWrapped. */}
                {hasWrapped(event) && (isParticipant || isHost) && (
                  <Button
                    label="Open the event wrap"
                    onPress={() => {
                      sheetRef.current?.close();
                      router.push(`/events/wrap/${event.id}`);
                    }}
                  />
                )}

                {/* Live event: the headline action, then check-in for guests.
                    The host is a participant since migration 043, so
                    `isParticipant` is true for them too — guest-only actions are
                    guarded with `!isHost`. */}
                {!hasWrapped(event) && (
                  <>
                    {isHost ? (
                      <Button
                        label="Manage event"
                        onPress={() => {
                          sheetRef.current?.close();
                          router.push(`/events/host/${event.id}`);
                        }}
                      />
                    ) : isParticipant ? (
                      <Button
                        label="Open chat"
                        onPress={() => {
                          sheetRef.current?.close();
                          router.push(`/(tabs)/chats/${event.id}`);
                        }}
                      />
                    ) : (
                      <View style={styles.footerRow}>
                        {event.max_people != null && (
                          <View style={styles.spotsInfo}>
                            <Text style={styles.spotsCount}>
                              {event.participant_count}/{event.max_people}
                            </Text>
                            <Text style={styles.spotsLeft}>
                              {Math.max(
                                event.max_people - event.participant_count,
                                0
                              )}{' '}
                              spots left
                            </Text>
                          </View>
                        )}
                        <Button
                          style={{ flex: 1 }}
                          label={
                            isPending
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
                          // Joining is the headline action, so it gets coral.
                          // A pending/closed state drops to low emphasis.
                          variant={
                            isPending || isFull || womenOnlyLocked
                              ? 'tertiary'
                              : 'primary'
                          }
                          // Pending cancels the request (no reason — a request
                          // withdrawn before approval isn't "leaving").
                          onPress={() =>
                            isPending ? leave.mutate() : handleJoinPress()
                          }
                          disabled={
                            ((isFull || womenOnlyLocked) && !isPending) ||
                            join.isPending ||
                            leave.isPending
                          }
                        />
                      </View>
                    )}

                    {/* Host also gets the chat, under Manage. */}
                    {isHost && (
                      <Button
                        label="Open chat"
                        variant="tertiary"
                        onPress={() => {
                          sheetRef.current?.close();
                          router.push(`/(tabs)/chats/${event.id}`);
                        }}
                      />
                    )}

                    {/* Approved guest scans to check in (hosts run the door). */}
                    {isParticipant && !isHost && (
                      <Button
                        label="Check in"
                        variant="tertiary"
                        onPress={() => {
                          sheetRef.current?.close();
                          router.push(`/events/scan/${event.id}`);
                        }}
                      />
                    )}
                  </>
                )}

                {/* Who's going — a frosted card, sitting between check-in and
                    leave. Shown to everyone; only attendees get the full list. */}
                <Glass
                  tier="panel"
                  radius={RADIUS.lg}
                  shadow={false}
                  style={styles.goingCard}
                >
                  <View style={styles.goingCardHead}>
                    <SectionLabel>{"Who's going"}</SectionLabel>
                    {event.participant_count > 0 && (
                      <Text style={styles.goingCardCount}>
                        {event.participant_count}
                        {event.max_people ? `/${event.max_people}` : ''}
                      </Text>
                    )}
                  </View>
                  <View style={styles.goingCardBody}>
                    <AttendeeStack
                      people={approved}
                      count={event.participant_count}
                      max={3}
                      size={36}
                      emptyLabel="Be the first to join"
                    />
                    {isParticipant || isHost ? (
                      event.participant_count > 0 && (
                        <PressableScale
                          onPress={() => {
                            sheetRef.current?.close();
                            router.push(`/events/attendees/${event.id}`);
                          }}
                        >
                          <Text style={styles.goingCardLink}>See all</Text>
                        </PressableScale>
                      )
                    ) : (
                      <Text style={styles.goingCardHint}>
                        Join to see the full list of attendees
                      </Text>
                    )}
                  </View>
                </Glass>

                {/* Leave — live event, guest only, and always last. Confirm
                    first, then a reason (recorded in event_leave_feedback). */}
                {isParticipant && !isHost && !hasWrapped(event) && (
                  <Button
                    label="Leave event"
                    variant="tertiary"
                    onPress={() => setLeaveStep('confirm')}
                    disabled={leave.isPending}
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

        {/* Leave flow, step 1: confirm. Backdrop-tap can't dismiss a destructive
            action — you leave by choosing, or explicitly stay. */}
        <Dialog
          visible={leaveStep === 'confirm'}
          onClose={resetLeaveFlow}
          dismissOnBackdropPress={false}
        >
          <Text style={styles.leaveTitle}>Leave this event?</Text>
          <Text style={styles.leaveBody}>
            {"You'll lose your spot and drop out of the event chat."}
          </Text>
          <View style={styles.leaveDialogButtons}>
            <Button
              label="Stay"
              variant="tertiary"
              size="md"
              style={{ flex: 1 }}
              onPress={resetLeaveFlow}
            />
            <Button
              label="Yes, leave"
              variant="secondary"
              size="md"
              style={{ flex: 1 }}
              onPress={() => setLeaveStep('reason')}
            />
          </View>
        </Dialog>

        {/* Leave flow, step 2: the reason, recorded in event_leave_feedback. */}
        <Sheet
          visible={leaveStep === 'reason'}
          onClose={resetLeaveFlow}
          grabber
          keyboardAvoiding
          animation="slide"
        >
          <View style={styles.reasonSheet}>
            <Text style={styles.leaveTitle}>Why are you leaving?</Text>
            <View style={styles.reasonChips}>
              {LEAVE_REASONS.map((r) => {
                const selected = leaveReason === r;
                return (
                  <PressableScale
                    key={r}
                    scaleTo={0.97}
                    onPress={() => setLeaveReason(r)}
                    style={[styles.reasonChip, selected && styles.reasonChipOn]}
                  >
                    <Text
                      style={[
                        styles.reasonChipText,
                        selected && styles.reasonChipTextOn,
                      ]}
                    >
                      {r}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
            <TextField
              value={leaveDetail}
              onChangeText={setLeaveDetail}
              placeholder="Anything the host should know? (optional)"
              multiline
            />
            <Button
              label="Leave event"
              onPress={confirmLeave}
              disabled={!leaveReason || leave.isPending}
            />
          </View>
        </Sheet>
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
  content: { padding: SPACING[5], paddingTop: 0, gap: SPACING[3] },
  banner: {
    height: 200,
    marginHorizontal: -20,
    marginBottom: SPACING[0.5],
    backgroundColor: '#E3E1E4',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerHint: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.nano,
    letterSpacing: 0.5,
    color: COLORS.textMuted,
  },
  grab: {
    position: 'absolute',
    top: 12,
    width: 40,
    height: 5,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  bannerPill: { position: 'absolute', top: 22, left: 16 },
  bannerActions: {
    position: 'absolute',
    top: 22,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.titleLg,
    lineHeight: 26,
    letterSpacing: -0.6,
    color: COLORS.textPrimary,
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },
  hostNameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
  },
  hostName: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  hostLabel: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  goingWrap: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },
  goingText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textSecondary,
  },
  infoRow: { flexDirection: 'row', gap: SPACING[2] },
  infoCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: RADIUS.md,
    padding: SPACING[2.5],
  },
  // Row children don't shrink by default, so without flex the text column
  // measures at full content width and spills past the card — long addresses
  // need this to ellipsize inside the tile instead of overflowing it.
  infoText: { flex: 1, minWidth: 0 },
  infoTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textPrimary,
  },
  infoSub: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.nano,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  description: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 21,
    color: '#5C5860',
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3.5] },
  spotsInfo: {},
  spotsCount: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.title,
    color: COLORS.textPrimary,
  },
  spotsLeft: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.nano,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  sectionLabel: { marginBottom: SPACING[2] },
  // The frosted "who's going" card that sits in the action stack.
  goingCard: { padding: SPACING[3.5], gap: SPACING[2.5] },
  goingCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goingCardCount: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },
  goingCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[2],
  },
  goingCardLink: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.primary,
  },
  goingCardHint: {
    flexShrink: 1,
    textAlign: 'right',
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  pendingSection: { gap: SPACING[2] },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING[2.5],
  },
  pendingNameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
  },
  pendingName: {
    flexShrink: 1,
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  approveBtn: {
    height: 34,
    paddingHorizontal: SPACING[3.5],
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: { fontFamily: FONTS.bold, color: '#fff', fontSize: TYPE_SIZE.caption },
  rejectBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.xs,
    backgroundColor: '#F0F1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { gap: SPACING[2.5], marginTop: SPACING[1] },
  premiumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING[1.5],
    paddingHorizontal: SPACING[2.5],
    paddingVertical: SPACING[1.5],
    borderRadius: RADIUS.full,
    backgroundColor: PREMIUM_GOLD_TINT,
  },
  premiumPillText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: PREMIUM_GOLD,
  },
  womenOnlyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING[1.5],
    paddingHorizontal: SPACING[2.5],
    paddingVertical: SPACING[1.5],
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(149,9,82,0.10)',
  },
  womenOnlyText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.secondary,
  },
  // On-photo frosted chip for the banner's wishlist/share buttons.
  chip: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  // ── Leave flow ──────────────────────────────────────────────────────────────
  leaveTitle: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.title,
    letterSpacing: -0.4,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  leaveBody: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[2],
  },
  leaveDialogButtons: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: SPACING[2.5],
    marginTop: SPACING[5],
  },
  reasonSheet: { padding: SPACING[5], gap: SPACING[3] },
  reasonChips: { gap: SPACING[2] },
  reasonChip: {
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.surface,
  },
  reasonChipOn: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.background,
  },
  reasonChipText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textSecondary,
  },
  reasonChipTextOn: { fontFamily: FONTS.bold, color: COLORS.textPrimary },
  // Rendered inside BottomSheetFooter, which handles positioning — the style
  // only shapes the pill itself.
  toast: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[4],
    height: 42,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
    shadowColor: '#0F182C',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  toastText: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.bodySm, color: '#fff' },
});
