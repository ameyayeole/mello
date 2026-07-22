import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useOverlayScreen } from '@/hooks/useOverlayScreen';
import { useFriends } from '@/hooks/useFriends';
import {
  getNotifications,
  markAllRead,
  markRead,
} from '@/services/notifications.service';
import {
  approveParticipant,
  getPendingRequestKeys,
  rejectParticipant,
} from '@/services/events.service';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Notification } from '@/types/models';
import { shortRelativeTime } from '@/utils/time';
import {
  Avatar,
  Button,
  EmptyState,
  Glass,
  Icon,
  IconName,
  Loader,
  PressableScale,
} from '@/components/ui';
import { NOTIFICATION_ICONS } from '@/constants/notificationStyle';

// ── The transition ───────────────────────────────────────────────────────────
//
// This route is transparent and its native animation is off (see the root
// layout), so every part of the opening and closing is driven from here. The
// timings are in OVERLAY_TRANSITION, alongside the ones the home screen uses —
// this is choreography across two files and the numbers have to agree.
//
// Two values, not one. The chip's journey and the content's arrival start at
// different moments and run for different lengths in both directions; hanging
// both off sub-ranges of a single eased value put the easing curve in charge of
// the choreography, and the exit read as a lag because of it.
//
// The content's three blocks still stagger off sub-ranges of `content` — they
// are one thing arriving, and there the curve is the point.
const TITLE_IN = [0, 0.55] as const;
const CHIPS_IN = [0.15, 0.72] as const;
const LIST_IN = [0.3, 0.9] as const;

// The bell hands over to the chevron across the middle of the flight, so the
// chip is visibly turning into the back button *while* it moves rather than
// arriving and then changing its mind.
const BELL_OUT = [0.05, 0.4] as const;
const CHEVRON_IN = [0.35, 0.75] as const;

// Matches the home header's chip exactly — 46 with a 23 radius. Both are
// geometry (a circle's radius is half its width), not steps on the radius
// scale, which is why neither is a RADIUS token.
const CIRCLE = 46;
const CIRCLE_RADIUS = 23;

// ── Filters ──────────────────────────────────────────────────────────────────

type FilterId = 'all' | 'requests' | 'rsvps' | 'mentions';

// Something waiting on a decision from you. This is also what puts the
// Accept/Decline pair on a row, so the Requests chip and the rows that can be
// acted on are the same set by construction rather than by coincidence.
function isRequest(n: Notification): boolean {
  if (n.type === 'friend_request') return true;
  return (
    n.type === 'join_request' &&
    (n.payload as { pending?: boolean })?.pending === true
  );
}

// Movement on who is going to what.
const RSVP_TYPES = new Set([
  'join_request', // the non-pending kind: someone just joined
  'join_approved',
  'friend_joined_event',
  'event_starting_soon',
  'event_update',
  'event_boosted',
]);

// Someone talking to you or about you.
const MENTION_TYPES = new Set([
  'mention',
  'new_message',
  'host_announcement',
  'note_received',
  'photo_commented',
]);

// Not every type lands in a bucket — a wrap prompt and a photo like answer none
// of these three questions. Those appear under All only, deliberately: forcing
// them into the nearest bucket would make the chip lie about what it holds.
const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'requests', label: 'Requests' },
  { id: 'rsvps', label: 'RSVPs' },
  { id: 'mentions', label: 'Mentions' },
];

function inFilter(n: Notification, filter: FilterId): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'requests':
      return isRequest(n);
    case 'rsvps':
      return RSVP_TYPES.has(n.type) && !isRequest(n);
    case 'mentions':
      return MENTION_TYPES.has(n.type);
  }
}

// ── Copy ─────────────────────────────────────────────────────────────────────

type RowLinks = {
  person?: () => void;
  event?: () => void;
};

/**
 * A bolded span *is* the link — there is no second colour and no underline.
 * The bold already marks the only two things a notification is ever about (who
 * did it, and which event it was about), so making exactly those the tap
 * targets is the reading you would guess from looking at it.
 *
 * A nested `<Text>` with an `onPress` claims the touch responder ahead of the
 * row's own Pressable, so tapping a name opens the profile without also firing
 * the row's event target. Without `onPress` this renders as plain bold — a
 * notification whose sender was deleted has nothing to link to.
 */
function Bold({
  onPress,
  children,
}: {
  onPress?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Text
      style={styles.bold}
      onPress={onPress}
      suppressHighlighting
      accessibilityRole={onPress ? 'link' : undefined}
    >
      {children}
    </Text>
  );
}

function notifText(notif: Notification, links: RowLinks): React.ReactNode {
  const payload = notif.payload as Record<string, unknown> | null;
  const name = notif.sender?.name ?? 'Someone';
  const title = (payload?.eventTitle as string | undefined) ?? notif.event?.title;

  // Only link a name we actually have a profile for, and an event we have an id
  // for. Everything else falls back to unlinked bold.
  const who = <Bold onPress={links.person}>{name}</Bold>;
  const what = (fallback: string) => (
    <Bold onPress={links.event}>{title ?? fallback}</Bold>
  );

  switch (notif.type) {
    case 'join_approved':
      return (
        <>
          Your request to join {what('the event')} was approved 🎉
        </>
      );
    case 'friend_request':
      return <>{who} sent you a friend request</>;
    case 'friend_accepted':
      return <>{who} accepted your friend request 🎉</>;
    case 'join_request':
      return (
        <>
          {who}{' '}
          {(payload as { pending?: boolean })?.pending
            ? 'asked to join'
            : 'is going to'}{' '}
          {what('your event')}
        </>
      );
    case 'new_message':
      return title ? (
        <>
          {who} sent a message in {what('the chat')}
        </>
      ) : (
        <>{who} sent you a message</>
      );
    case 'mention':
      return (
        <>
          {who} mentioned you in {what('the chat')}
        </>
      );
    case 'host_announcement':
      return (
        <>
          📣 {who} made an announcement about {what('your event')}
        </>
      );
    case 'event_starting_soon':
      return <>{what('Your event')} is starting soon</>;
    case 'friend_joined_event':
      return (
        <>
          {who} is going to {what('an event')} with you
        </>
      );
    case 'event_update':
      return (
        <>
          {who} updated {what('an event')}
        </>
      );
    case 'event_boosted':
      return <>🔥 {what('An event')} you wishlisted just got boosted</>;
    case 'wrap_ready':
      return <>How was {what('your event')}? The wrap is ready 📸</>;
    case 'note_received':
      return <>💌 Someone from {what('your event')} left you a note</>;
    case 'photo_liked':
      return <>{who} liked your photo</>;
    case 'photo_commented':
      return <>{who} commented on your photo</>;
    case 'encore_requested':
      return <>🔁 People want you to run {what('your event')} back</>;
    default:
      return who;
  }
}

// ── Rows ─────────────────────────────────────────────────────────────────────

type RowAction = {
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
};

function NotifRow({
  notif,
  index,
  links,
  action,
  onPress,
}: {
  notif: Notification;
  index: number;
  links: RowLinks;
  // Present only while the decision is genuinely still open — see
  // `openRequest` on the screen below.
  action?: RowAction;
  onPress: () => void;
}) {
  const glyph = NOTIFICATION_ICONS[notif.type] ?? {
    icon: 'bell' as IconName,
    color: COLORS.primary,
    tint: COLORS.primaryTint,
  };
  const sender = notif.sender;

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(340)}
      style={styles.rowWrap}
    >
      <PressableScale scaleTo={0.985} onPress={onPress}>
        <Glass tier="panel" radius={RADIUS['2xl']} style={styles.row}>
          {/* Unread rail. Inset top and bottom so it never has to negotiate
              with the pane's rounded corners — it is a sibling of the glass,
              not a child of it, so it is not clipped by them. */}
          {!notif.is_read && <View style={styles.unreadRail} />}

          <View>
            {sender ? (
              <Avatar name={sender.name} photoUrl={sender.photo_url} size={46} />
            ) : (
              <View style={[styles.glyphCircle, { backgroundColor: glyph.tint }]}>
                <Icon name={glyph.icon} size={20} color={glyph.color} />
              </View>
            )}
            {/* With a face in the slot, the per-type colour and glyph move to a
                badge on its corner: you still get "what kind of thing is this"
                at a glance without losing "who". */}
            {sender && (
              <View style={[styles.typeBadge, { backgroundColor: glyph.color }]}>
                <Icon
                  name={glyph.icon}
                  size={10}
                  color={COLORS.white}
                  strokeWidth={2.6}
                />
              </View>
            )}
          </View>

          <View style={styles.rowText}>
            <Text style={styles.rowBody}>{notifText(notif, links)}</Text>
            <Text style={styles.rowTime}>
              {shortRelativeTime(notif.created_at)}
            </Text>

            {action && (
              <View style={styles.actions}>
                <Button
                  label="Accept"
                  variant="secondary"
                  size="sm"
                  onPress={action.onAccept}
                  loading={action.busy}
                />
                <Button
                  label="Decline"
                  variant="tertiary"
                  size="sm"
                  onPress={action.onDecline}
                  disabled={action.busy}
                />
              </View>
            )}
          </View>
        </Glass>
      </PressableScale>
    </Animated.View>
  );
}

// A filter chip. Local rather than a `ui/` primitive: `CategoryPill` is built
// around an activity's emoji and accent colour, and nothing else in the app has
// a filter chip row yet. If a second screen grows one, that is the moment to
// lift this into `ui/`.
function FilterChip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  const body = (
    <>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
      {count > 0 && (
        <View style={styles.chipBadge}>
          <Text style={styles.chipBadgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </>
  );

  return (
    <PressableScale
      scaleTo={0.94}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {selected ? (
        <View style={[styles.chip, styles.chipSelected]}>{body}</View>
      ) : (
        // `shadow={false}`: <Glass>'s lift is a wide, soft one (12pt down, 24
        // blur) sized for a panel floating alone. Four pills 8pt apart each
        // cast it, and at this size they merge into a single grey band running
        // the width of the row — the chips looked like they were sitting on a
        // bar. The bright hairline is what makes them read as glass anyway.
        <Glass
          tier="panel"
          radius={RADIUS.full}
          shadow={false}
          style={styles.chip}
        >
          {body}
        </Glass>
      )}
    </PressableScale>
  );
}

type ListItem =
  | { kind: 'header'; label: string; id: string; markAll: boolean }
  | { kind: 'notif'; notif: Notification; id: string };

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  // The chip's flight, the content's arrival and the way out — all of it is the
  // app's overlay choreography, shared with the search screen.
  const { travel, content, handoff, dismiss } = useOverlayScreen();

  const [filter, setFilter] = useState<FilterId>('all');
  // The row currently being accepted or declined. One at a time — these are
  // decisions, and two in flight would mean two spinners and no way to tell
  // which one the next tap belongs to.
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: notifications, isLoading } = useQuery({
    queryKey: queryKeys.notifications.of(user?.id),
    queryFn: () => getNotifications(user!.id),
    enabled: !!user,
  });

  const all = useMemo(() => notifications ?? [], [notifications]);

  // ── Which requests are still open ─────────────────────────────────────────
  //
  // A notification's payload freezes at insert time, so a join request approved
  // last week still reads `pending: true`. Asking the participant table settles
  // it for the whole list in one query — without it, Decline on an already
  // approved row would quietly remove a real attendee.
  const requestEventIds = useMemo(
    () =>
      Array.from(
        new Set(
          all
            .filter((n) => n.type === 'join_request' && n.event_id)
            .map((n) => n.event_id as string)
        )
      ),
    [all]
  );

  // Single call site, so the key stays here rather than in queryKeys.
  const pendingKey = ['pendingRequestKeys', requestEventIds.join(',')] as const;
  const { data: pendingKeys } = useQuery({
    queryKey: pendingKey,
    queryFn: () => getPendingRequestKeys(requestEventIds),
    enabled: requestEventIds.length > 0,
  });

  // Friend requests get the same treatment for free: `useFriends` already keeps
  // every friendship row, and 'request_received' is exactly "still open".
  const { relationshipWith, accept: acceptFriend, remove: removeFriend } =
    useFriends();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.notifications.of(user?.id) });
    qc.invalidateQueries({
      queryKey: queryKeys.notificationsUnread.of(user?.id),
    });
  };

  const markAll = useMutation({
    mutationFn: () => markAllRead(user!.id),
    onSuccess: invalidate,
  });

  const markOne = useMutation({
    mutationFn: (id: string) => markRead(id),
    onSuccess: invalidate,
  });

  const afterRequest = () => {
    qc.invalidateQueries({ queryKey: ['pendingRequestKeys'] });
    qc.invalidateQueries({ queryKey: queryKeys.eventDetail.all });
    // Approving changes the going count and the faces on every card for that
    // event.
    qc.invalidateQueries({ queryKey: queryKeys.attendeePreviews.all });
    setBusyId(null);
  };

  const approve = useMutation({
    mutationFn: (v: { eventId: string; userId: string }) =>
      approveParticipant(v.eventId, v.userId),
    onSettled: afterRequest,
  });

  const reject = useMutation({
    mutationFn: (v: { eventId: string; userId: string }) =>
      rejectParticipant(v.eventId, v.userId),
    onSettled: afterRequest,
  });

  // ── The transition ────────────────────────────────────────────────────────

  const destX = SPACING[5];
  const destY = insets.top + SPACING[3];
  const hasOrigin = !!handoff;
  const fromX = handoff?.x ?? destX;
  const fromY = handoff?.y ?? destY;

  const circleStyle = useAnimatedStyle(() => {
    const t = travel.value;
    return {
      transform: [
        { translateX: fromX + (destX - fromX) * t },
        { translateY: fromY + (destY - fromY) * t },
        // A dip through the middle of the journey. A circle that slides at a
        // fixed size reads as a sprite being dragged; one that gives a little
        // on the way reads as an object with weight.
        { scale: interpolate(t, [0, 0.5, 1], [1, 0.94, 1]) },
      ],
      // Nothing to fly from, so it arrives in place instead.
      opacity: hasOrigin
        ? 1
        : interpolate(t, [0, 0.4], [0, 1], Extrapolation.CLAMP),
    };
  });

  const bellStyle = useAnimatedStyle(() => ({
    opacity: interpolate(travel.value, BELL_OUT, [1, 0], Extrapolation.CLAMP),
  }));

  const backStyle = useAnimatedStyle(() => ({
    opacity: interpolate(travel.value, CHEVRON_IN, [0, 1], Extrapolation.CLAMP),
  }));

  // Each block rises a little further than the one above it, so the screen
  // assembles from the top down instead of arriving as one slab. Written out
  // three times rather than through a helper: useAnimatedStyle is a hook, and a
  // hook called from a helper is a rule the linter is right to enforce.
  const titleStyle = useAnimatedStyle(() => {
    const t = interpolate(content.value, TITLE_IN, [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * 14 }] };
  });

  const chipsStyle = useAnimatedStyle(() => {
    const t = interpolate(content.value, CHIPS_IN, [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * 18 }] };
  });

  const listStyle = useAnimatedStyle(() => {
    const t = interpolate(content.value, LIST_IN, [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * 26 }] };
  });

  // ── Navigation out ────────────────────────────────────────────────────────
  //
  // Two shapes, and which one a target takes is not a style choice. Anything
  // that lives on the home screen (the event bottom sheet) or on a tab has to
  // be reached from underneath this screen, so those dismiss first. A target
  // that is its own route is pushed on top instead — backing out of a profile
  // then puts you back in the list you were reading, which is the whole point
  // of being able to tap a name.
  const openEvent = useCallback(
    (eventId: string) => {
      useUIStore.getState().setSelectedEvent(eventId);
      dismiss();
    },
    [dismiss]
  );

  const openPerson = useCallback(
    (userId: string) => router.push(`/friends/${userId}`),
    [router]
  );

  const onPressNotif = useCallback(
    (notif: Notification) => {
      if (!notif.is_read) markOne.mutate(notif.id);
      const payload = notif.payload as Record<string, unknown> | null;
      const friendId = payload?.friendId as string | undefined;

      switch (notif.type) {
        case 'friend_request':
        case 'friend_accepted':
          if (notif.sender_id) return openPerson(notif.sender_id);
          return dismiss(() => router.push('/friends'));
        case 'new_message':
        case 'mention':
        case 'host_announcement':
          if (friendId) {
            return dismiss(() => router.push(`/(tabs)/chats/dm/${friendId}`));
          }
          if (notif.event_id) {
            return dismiss(() =>
              router.push(`/(tabs)/chats/${notif.event_id}`)
            );
          }
          break;
        case 'wrap_ready':
          if (notif.event_id) {
            return router.push(`/events/wrap/${notif.event_id}`);
          }
          break;
        case 'photo_liked':
        case 'photo_commented':
          if (notif.event_id) {
            return router.push(`/events/wrap/gallery/${notif.event_id}`);
          }
          break;
        case 'note_received':
          return dismiss(() => router.push('/(tabs)/chats'));
        case 'encore_requested':
          if (notif.event_id) {
            return router.push(`/events/host/${notif.event_id}`);
          }
          break;
        default:
          break;
      }

      if (notif.event_id) openEvent(notif.event_id);
    },
    [dismiss, markOne, openEvent, openPerson, router]
  );

  // ── The list ──────────────────────────────────────────────────────────────

  const shown = useMemo(
    () => all.filter((n) => inFilter(n, filter)),
    [all, filter]
  );

  // Unread only: a chip badge is a nudge, and there is nothing to nudge about
  // in a bucket you have already read through. `all` gets none — that is what
  // the bell's own dot already said.
  const counts = useMemo(() => {
    const unread = all.filter((n) => !n.is_read);
    return {
      all: 0,
      requests: unread.filter((n) => inFilter(n, 'requests')).length,
      rsvps: unread.filter((n) => inFilter(n, 'rsvps')).length,
      mentions: unread.filter((n) => inFilter(n, 'mentions')).length,
    } as Record<FilterId, number>;
  }, [all]);

  const items = useMemo<ListItem[]>(() => {
    const unread = shown.filter((n) => !n.is_read);
    const read = shown.filter((n) => n.is_read);
    return [
      ...(unread.length
        ? [{ kind: 'header' as const, label: 'New', id: 'h-new', markAll: true }]
        : []),
      ...unread.map((n) => ({ kind: 'notif' as const, notif: n, id: n.id })),
      // "Mark all read" hangs off the New header alone: it is the only one with
      // anything to act on, and a second copy over Earlier would be a control
      // that does nothing.
      ...(read.length
        ? [
            {
              kind: 'header' as const,
              label: 'Earlier',
              id: 'h-earlier',
              markAll: false,
            },
          ]
        : []),
      ...read.map((n) => ({ kind: 'notif' as const, notif: n, id: n.id })),
    ];
  }, [shown]);

  // The pair of buttons, or nothing. Both branches check live state rather than
  // the notification's own payload, which is why an already-handled request
  // shows the row without offering the decision a second time.
  const openRequest = useCallback(
    (notif: Notification): RowAction | undefined => {
      const senderId = notif.sender_id;
      if (!senderId) return undefined;
      const busy = busyId === notif.id;

      if (notif.type === 'join_request' && notif.event_id) {
        const key = `${notif.event_id}:${senderId}`;
        if (!pendingKeys?.has(key)) return undefined;
        const v = { eventId: notif.event_id, userId: senderId };
        return {
          busy,
          onAccept: () => {
            setBusyId(notif.id);
            markOne.mutate(notif.id);
            approve.mutate(v);
          },
          onDecline: () => {
            setBusyId(notif.id);
            markOne.mutate(notif.id);
            reject.mutate(v);
          },
        };
      }

      if (notif.type === 'friend_request') {
        const rel = relationshipWith(senderId);
        if (rel.status !== 'request_received' || !rel.friendshipId) {
          return undefined;
        }
        const id = rel.friendshipId;
        return {
          busy,
          onAccept: () => {
            setBusyId(notif.id);
            markOne.mutate(notif.id);
            acceptFriend.mutate(id, { onSettled: () => setBusyId(null) });
          },
          onDecline: () => {
            setBusyId(notif.id);
            markOne.mutate(notif.id);
            removeFriend.mutate(id, { onSettled: () => setBusyId(null) });
          },
        };
      }

      return undefined;
    },
    [
      acceptFriend,
      approve,
      busyId,
      markOne,
      pendingKeys,
      reject,
      relationshipWith,
      removeFriend,
    ]
  );

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <View style={[styles.content, { paddingTop: destY + CIRCLE + SPACING[5] }]}>
        <Animated.Text style={[styles.title, titleStyle]}>
          Notifications
        </Animated.Text>

        <Animated.View style={chipsStyle}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            {FILTERS.map((f) => (
              <FilterChip
                key={f.id}
                label={f.label}
                count={counts[f.id]}
                selected={filter === f.id}
                onPress={() => setFilter(f.id)}
              />
            ))}
          </ScrollView>
        </Animated.View>

        <Animated.View style={[styles.fill, listStyle]}>
          {isLoading ? (
            <Loader />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.list,
                { paddingBottom: insets.bottom + SPACING[8] },
              ]}
              renderItem={({ item, index }) =>
                item.kind === 'header' ? (
                  <View style={styles.sectionRow}>
                    <Text style={styles.sectionLabel}>{item.label}</Text>
                    {item.markAll && (
                      <Text
                        style={styles.markAll}
                        onPress={() => markAll.mutate()}
                        suppressHighlighting
                      >
                        Mark all read
                      </Text>
                    )}
                  </View>
                ) : (
                  <NotifRow
                    notif={item.notif}
                    index={index}
                    action={openRequest(item.notif)}
                    links={{
                      person: item.notif.sender_id
                        ? () => openPerson(item.notif.sender_id!)
                        : undefined,
                      event: item.notif.event_id
                        ? () => openEvent(item.notif.event_id!)
                        : undefined,
                    }}
                    onPress={() => onPressNotif(item.notif)}
                  />
                )
              }
              ListEmptyComponent={
                <EmptyState
                  icon="bell"
                  title={
                    filter === 'all'
                      ? "You're all caught up"
                      : 'Nothing here yet'
                  }
                  body={
                    filter === 'all'
                      ? 'RSVP updates, messages and reminders land here.'
                      : 'Try another filter — All has everything.'
                  }
                />
              }
            />
          )}
        </Animated.View>
      </View>

      {/* The travelling chip. Absolutely positioned in *window* coordinates,
          outside the padded content column, because that is the space the
          origin was measured in — putting it inside a safe-area-inset parent
          would offset it by the notch.

          Deliberately keeps its glass fill, where AGENTS.md's NavButton is a
          bare glyph. The chip is load-bearing here: it is the same object the
          user pressed on the home screen, and an object that dissolves halfway
          through its own journey has not moved anywhere. */}
      <Animated.View
        style={[styles.circle, circleStyle]}
        pointerEvents="box-none"
      >
        <PressableScale
          scaleTo={0.9}
          onPress={() => dismiss()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Glass tier="panel" radius={CIRCLE_RADIUS} style={styles.circleGlass}>
            {/* Both glyphs sit in the same place and cross-fade. Two absolute
                children rather than a swap, so nothing reflows mid-flight. */}
            <Animated.View style={[styles.circleGlyph, bellStyle]}>
              <Icon name="bell" size={20} color={COLORS.textPrimary} />
            </Animated.View>
            <Animated.View style={[styles.circleGlyph, backStyle]}>
              <Icon
                name="back"
                size={22}
                color={COLORS.textPrimary}
                strokeWidth={2.1}
              />
            </Animated.View>
          </Glass>
        </PressableScale>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // No background: the route is transparent, so what shows through is
  // <AppBackground> — the one already mounted behind the tab navigator, still
  // drifting. A second copy here would be a second blob at a different point in
  // its cycle, cross-fading against the first.
  root: { flex: 1 },
  content: { flex: 1 },
  fill: { flex: 1 },

  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.display,
    lineHeight: 40,
    letterSpacing: -1,
    color: COLORS.textPrimary,
    paddingHorizontal: SPACING[5],
  },

  chipScroll: { marginTop: SPACING[4], flexGrow: 0 },
  chipRow: { paddingHorizontal: SPACING[5], gap: SPACING[2], paddingVertical: SPACING[1] },
  chip: {
    height: 42,
    paddingHorizontal: SPACING[5],
    borderRadius: RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  // Ink, not coral: selection is a state, not an offer. Coral on this screen is
  // reserved for the unread rail and the count badges.
  chipSelected: { backgroundColor: COLORS.accent },
  chipText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
  },
  chipTextSelected: { color: COLORS.white },
  chipBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: SPACING[1.5],
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.nano,
    lineHeight: 13,
    color: COLORS.white,
  },

  list: { paddingTop: SPACING[2] },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[4],
    paddingBottom: SPACING[2],
  },
  sectionLabel: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.micro,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
  },
  markAll: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },

  rowWrap: { paddingHorizontal: SPACING[5], paddingBottom: SPACING[2.5] },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING[3],
    paddingVertical: SPACING[3.5],
    paddingLeft: SPACING[4],
    paddingRight: SPACING[3.5],
  },
  // 3pt of coral down the leading edge, inset from the corners. Replaces the
  // pale unread *fill* the rows used to carry, which on a translucent panel over
  // a drifting background read as a tint on the glass rather than as a state.
  unreadRail: {
    position: 'absolute',
    left: 1,
    top: SPACING[3.5],
    bottom: SPACING[3.5],
    width: 3,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  glyphCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  rowText: { flex: 1 },
  rowBody: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  bold: { fontFamily: FONTS.bold, color: COLORS.textPrimary },
  rowTime: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
    marginTop: SPACING[1],
  },
  actions: { flexDirection: 'row', gap: SPACING[2], marginTop: SPACING[3] },

  circle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CIRCLE,
    height: CIRCLE,
  },
  circleGlass: {
    width: CIRCLE,
    height: CIRCLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleGlyph: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
