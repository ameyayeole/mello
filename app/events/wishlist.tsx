import { useRef } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMyParticipation,
  getSavedEvents,
  unsaveEvent,
} from '@/services/events.service';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS, inkAlpha } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatEventWhen } from '@/utils/time';
import { eventImageUri } from '@/utils/events';
import { shortLocation } from '@/utils/location';
import { NearbyEvent, ParticipantStatus, SavedEventItem } from '@/types/models';
import {
  Avatar,
  Button,
  Icon,
  Loader,
  PressableScale,
  Screen,
  ScreenHeader,
} from '@/components/ui';
import { themedStyles } from '@/theme';

function WishlistCard({
  event,
  status,
  onPress,
  onRemove,
}: {
  event: SavedEventItem;
  // My participation in this event, or undefined if I have never asked to join.
  // Saving an event and joining it are different things — you can do either
  // first — so the wishlist has to be told, or it offers Join to people who are
  // already going. Which it did: the row said "Join", and the card it opened
  // said "Open chat".
  status?: ParticipantStatus;
  onPress: () => void;
  onRemove: () => void;
}) {
  const activity = ACTIVITY_MAP[event.activity];
  const cat = categoryStyle(event.activity);
  const imageUri = eventImageUri(event);
  // `Going` / `Requested` / `Join` — the home screen's nearby card's exact
  // vocabulary for the exact same three states (see its `label`), rather than a
  // second set of words for them. A host reads as "Going" there too: migration
  // 043 made a host an approved participant of their own event.
  const joined = status === 'approved';
  const requested = status === 'pending';
  const ctaLabel = joined
    ? 'Going'
    : requested
      ? 'Requested'
      : event.requires_approval
        ? 'Request to Join'
        : 'Join';

  return (
    <PressableScale style={styles.card} onPress={onPress} scaleTo={0.98}>
      {/* Media tile · title + time · remove bookmark */}
      <View style={styles.cardTop}>
        <View style={[styles.mediaTile, { backgroundColor: cat.tint }]}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <Text style={styles.mediaEmoji}>{activity?.emoji ?? '📍'}</Text>
          )}
        </View>
        <View style={styles.cardHeading}>
          <Text style={styles.title} numberOfLines={2}>
            {event.title}
          </Text>
          <View style={styles.timeRow}>
            <Icon name="clock" size={14} color={COLORS.textSecondary} />
            <Text style={styles.timeText} numberOfLines={1}>
              {formatEventWhen(event.starts_at)}
            </Text>
          </View>
        </View>
        <PressableScale
          scaleTo={0.85}
          style={styles.removeBtn}
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${event.title} from wishlist`}
        >
          <Icon name="bookmarkFilled" size={19} color={COLORS.primary} />
        </PressableScale>
      </View>

      {event.location_name ? (
        <View style={styles.locationRow}>
          <Icon
            name="location"
            size={14}
            color={COLORS.textPrimary}
            strokeWidth={2.2}
          />
          <Text style={styles.locationText} numberOfLines={1}>
            {shortLocation(event.location_name)}
          </Text>
        </View>
      ) : null}

      {event.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {event.description}
        </Text>
      ) : null}

      {/* Host */}
      <View style={styles.hostRow}>
        <Avatar
          name={event.host_name}
          photoUrl={event.host_photo_url}
          size={38}
        />
        <View>
          <Text style={styles.hostedBy}>Hosted By</Text>
          <Text style={styles.hostName} numberOfLines={1}>
            {event.host_name ?? 'Someone on Mello'}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Attendees · capacity · join CTA */}
      <View style={styles.footer}>
        {event.attendees.length > 0 && (
          <View style={styles.attendeeStack}>
            {event.attendees.slice(0, 3).map((a, i) => (
              <View
                key={a.id}
                style={[styles.attendeeRing, i > 0 && { marginLeft: -10 }]}
              >
                <Avatar name={a.name} photoUrl={a.photo_url} size={28} />
              </View>
            ))}
          </View>
        )}
        <Text style={styles.countText}>
          {event.participant_count}
          {event.max_people ? `/${event.max_people}` : ' going'}
        </Text>
        <View style={{ flex: 1 }} />
        {/* Tapping this opens the card, exactly as tapping the row does — the
            join itself happens there. So for someone already going it is a
            state, not an offer: `Going` is the honest label for a button that
            does not join you a second time. */}
        <PressableScale
          scaleTo={0.94}
          style={[styles.joinBtn, (joined || requested) && styles.joinBtnQuiet]}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Open ${event.title}`}
        >
          <Text
            style={[
              styles.joinText,
              (joined || requested) && styles.joinTextQuiet,
            ]}
          >
            {ctaLabel}
          </Text>
        </PressableScale>
      </View>
    </PressableScale>
  );
}

// Everything the user bookmarked or swiped right on, with the full detail
// sheet a tap away. The bookmark on each card takes it off the list.
export default function WishlistScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  // One measurable wrapper per card, keyed by event id — measured at tap time
  // for the dealt card's origin.
  const cardRefs = useRef<Record<string, View | null>>({});

  const { data: wishlist = [], isLoading } = useQuery({
    queryKey: queryKeys.savedEvents.of(user?.id),
    queryFn: () => getSavedEvents(user!.id),
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
  });

  // What each row's CTA says. The same query and the same key the home screen
  // uses, so this reads that cache rather than fetching again — and so joining
  // from the dealt card, which invalidates this key, corrects the row behind it.
  const { data: participation } = useQuery({
    queryKey: queryKeys.myParticipation.of(user?.id),
    queryFn: () => getMyParticipation(user!.id),
    enabled: !!user,
  });

  const remove = useMutation({
    mutationFn: (eventId: string) => unsaveEvent(user!.id, eventId),
    onMutate: (eventId) => {
      queryClient.setQueryData<NearbyEvent[]>(
        queryKeys.savedEvents.of(user?.id),
        (events = []) => events.filter((e) => e.id !== eventId)
      );
      queryClient.setQueryData<string[]>(
        queryKeys.savedEventIds.of(user?.id),
        (ids = []) => ids.filter((i) => i !== eventId)
      );
    },
  });

  return (
    <Screen modal>
      <ScreenHeader
        title="Wishlist"
        subtitle={
          wishlist.length === 0
            ? 'Events you save land here'
            : `${wishlist.length} ${wishlist.length === 1 ? 'event' : 'events'} saved`
        }
        backIcon="chevronDown"
        tone="transparent"
      />

      {isLoading ? (
        <Loader />
      ) : (
        <FlatList
          data={wishlist}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Animated.View
              entering={FadeInDown.delay(Math.min(index, 6) * 50).duration(320)}
            >
              {/* Plain View, not the Animated.View above: the ref this
                  measures needs a real host node — see useOpenOverlay's
                  comment on why an animated component's ref isn't one to
                  rely on for measureInWindow. */}
              <View
                ref={(el) => {
                  cardRefs.current[item.id] = el;
                }}
                collapsable={false}
              >
                <WishlistCard
                  event={item}
                  status={participation?.[item.id]}
                  // Deal, then dismiss — the order search.tsx and
                  // notifications.tsx already use, and not a style choice.
                  //
                  // This screen is `presentation: 'modal'`, so it is a *presented*
                  // view controller, and the dealt card is a window-level layer
                  // that sits above it. Everything the card needs to open after
                  // that is `Modal`-based — the pre-join safety popups, the leave
                  // dialog — and UIKit will not present a second modal from a
                  // controller that is already presenting one. So Join silently
                  // did nothing: the safety queue was set, no popup ever
                  // appeared, and the queue being non-empty leaves `CardPortal`
                  // *suspended* — opacity 0 but still mounted, a full-screen
                  // layer over the whole app. That is what read as the map
                  // freezing on the way back to it.
                  //
                  // Dealing over a screen that is on its way out has none of
                  // that: by the time there is a Join to tap, this modal is gone
                  // and the card is over the tabs like any other.
                  onPress={() => {
                    const node = cardRefs.current[item.id];
                    if (!node) {
                      useUIStore.getState().dealCard(item.id, null);
                      router.back();
                      return;
                    }
                    node.measureInWindow((x, y, width, height) => {
                      useUIStore
                        .getState()
                        .dealCard(item.id, { x, y, width, height });
                      router.back();
                    });
                  }}
                  onRemove={() => remove.mutate(item.id)}
                />
              </View>
            </Animated.View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Icon name="bookmark" size={34} color={COLORS.primary} />
              </View>
              <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
              <Text style={styles.emptyText}>
                Swipe right on events you like — or tap the bookmark — and
                they&apos;ll be waiting for you here.
              </Text>
              <Button
                label="Find events"
                height={44}
                // The swipe deck is no longer a screen of its own — it is the
                // dealt card, opened from the map's "Up for it?" fan. So this
                // sends you to the map rather than to a route that no longer
                // exists.
                onPress={() => router.push('/(tabs)/map')}
                style={{ marginTop: SPACING[1.5] }}
              />
            </View>
          }
        />
      )}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  list: { padding: SPACING[4], paddingTop: SPACING[2], gap: SPACING[3.5], flexGrow: 1 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS['2xl'],
    padding: SPACING[4],
    gap: SPACING[2.5],
    shadowColor: '#0F182C',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', gap: SPACING[3] },
  mediaTile: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaEmoji: { fontSize: TYPE_SIZE.h1 },
  cardHeading: { flex: 1, minWidth: 0, gap: SPACING[1], justifyContent: 'center' },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.sectionLg,
    lineHeight: 23,
    letterSpacing: -0.3,
    color: COLORS.textPrimary,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1] },
  timeText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },
  removeBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  locationText: {
    flexShrink: 1,
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
  },
  description: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginTop: -4,
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  hostedBy: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textSecondary,
  },
  hostName: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    letterSpacing: -0.2,
    color: COLORS.textPrimary,
    marginTop: SPACING[0.5],
  },
  // Full-bleed rule, mockup-style.
  divider: {
    height: 1,
    backgroundColor: inkAlpha(0.08),
    marginHorizontal: -16,
  },
  footer: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  attendeeStack: { flexDirection: 'row', alignItems: 'center' },
  attendeeRing: {
    borderRadius: RADIUS.xl,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  countText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: inkAlpha(0.5),
  },
  joinBtn: {
    height: 40,
    paddingHorizontal: SPACING[4],
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinText: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.bodySm, color: '#fff' },
  // Going / Requested are answers, not invitations, so they lose the coral.
  // Coral is for the one real decision on a screen (AGENTS.md's button rule) and
  // a wishlist of eight events you are already going to would be eight of them.
  joinBtnQuiet: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  joinTextQuiet: { color: COLORS.textSecondary },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2.5],
    paddingBottom: 60,
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[1.5],
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
  },
}));
