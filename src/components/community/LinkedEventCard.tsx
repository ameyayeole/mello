import { View,
  Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getEventCard } from '@/services/events.service';
import { useUIStore } from '@/stores/uiStore';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';
import EventRow from '@/components/events/EventRow';
import { themedStyles } from '@/theme';

/**
 * The event a post links to (migration 070), drawn under the post's body.
 *
 * `EventRow` rather than a bespoke card: it already draws exactly this — photo
 * or category thumb, title, when/going, a trailing affordance — and forking it
 * for the one screen that needed a slightly different frame is the failure mode
 * AGENTS.md opens with. `quiet` tone because the post is the thing being read;
 * the event is a reference within it, not a competing call to action.
 *
 * The event outliving the link is a real state, not an error: ref_event_id
 * survives an event being deactivated, so a miss renders a dead-end line
 * instead of an empty gap that looks like a layout bug.
 */
export function LinkedEventCard({
  eventId,
  // Inverted ink ramp for the profile sheet, threaded down from PostCard the
  // same way every other card in the subtree gets it (DESIGN.md). EventRow
  // already knows how to flip; this only has to pass it along.
  onDark = false,
}: {
  eventId: string;
  onDark?: boolean;
}) {
  const event = useQuery({
    queryKey: queryKeys.community.eventCard.of(eventId),
    queryFn: () => getEventCard(eventId),
    // An event's title/time barely move, and the same event is commonly linked
    // by several posts in one scroll.
    staleTime: 5 * 60_000,
  });

  if (event.isLoading) return <View style={styles.skeleton} />;

  if (!event.data) {
    return (
      <View style={styles.dead}>
        <Text style={[styles.deadText, onDark && styles.deadTextOnDark]}>
          This event is no longer available.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <EventRow
        event={event.data}
        cta="details"
        tone="quiet"
        photo
        onDark={onDark}
        // Deals the shared event card, the way every other event row in the app
        // does — there is no per-event route to push. `null` origin: the card
        // flies from centre rather than from this row, because the row can be
        // scrolled off-screen by the time the card lands.
        onPress={() => useUIStore.getState().dealCard(eventId, null)}
      />
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { marginTop: SPACING[2] },
  // Same height as the row it becomes, so the card doesn't jump when it lands.
  skeleton: {
    marginTop: SPACING[2],
    height: 72,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.inkSubtle,
  },
  dead: {
    marginTop: SPACING[2],
    padding: SPACING[3.5],
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.inkSubtle,
  },
  deadText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
  deadTextOnDark: { color: COLORS.textOnDarkMuted },
}));
