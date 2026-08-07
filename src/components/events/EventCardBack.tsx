import { type ReactNode } from 'react';
import { View,
  Text,
  ScrollView } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { RADIUS, SPACING } from '@/constants/spacing';
import { formatEventWhen } from '@/utils/time';
import { formatDistance } from '@/utils/distance';
import { neighbourhood } from '@/utils/location';
import { PREMIUM_GOLD, premiumGoldTint } from '@/utils/premium';
import type { EventDetail } from '@/types/models';
import {
  AttendeeStack,
  Icon,
  PressableScale,
  SectionLabel,
} from '@/components/ui';
import { themedStyles } from '@/theme';

export interface EventCardBackProps {
  event: EventDetail;
  // Whether the viewer is in this event (approved participant or host) — the
  // gate the roster is behind. Handed in rather than recomputed from
  // `event.participants` + a user id, since the front face and whatever wires
  // this card together already have to know it.
  isMember: boolean;
  // Whether the viewer is beyond the free join radius and would need Mello+
  // to join — `gate === 'premiumDistance'` from `useEventCard`, i.e. already
  // excludes the host, participants and pending requests, matching the
  // sheet's own `tooFar && !isParticipant && !isPending` condition. Handed
  // in rather than recomputed here: the distance query and premium check
  // both live in `useEventCard`, not this face.
  tooFar: boolean;
  // The non-pinned actions (Open chat, Check in, pending requests, Leave…).
  // This face renders them; it owns none of the mutations behind them — see
  // EventBottomSheet.tsx's "Actions" block for the set this replaces.
  secondaryActions?: ReactNode;
  /**
   * Open the full attendee list. Members only — it is the roster's gate, and
   * the link is hidden without it.
   *
   * A callback rather than a route, because this face is inside a card that
   * has to be dismissed before anything is pushed: the composing surface owns
   * that (`close()` then push), the same way it owns every other action here.
   */
  onSeeAll?: () => void;
}

// The roster row's avatar size — matches the sheet's `GOING_AVATAR`.
const ROSTER_AVATAR = 36;


// The card's back — the only scrolling surface in the whole dealt-card design.
// Description, the full roster (gated behind membership), then whatever
// secondary actions the composing screen hands in.
//
// It carried a "Happening near you" rail until 2026-08-04. Cut on review of the
// first device run: a card you opened to decide about ONE event should not be
// advertising four others underneath it.
export function EventCardBack({
  event,
  isMember,
  tooFar,
  secondaryActions,
  onSeeAll,
}: EventCardBackProps) {
  const approved = event.participants.filter((p) => p.status === 'approved');

  // Host first, then the rest by join time. Order comes from the server —
  // `event_attendees_preview` ranks by `ep.joined_at, pr.id`, and migration 043
  // gives the host a participant row at creation time, so the host already
  // sorts first. The pin is belt-and-braces: the RLS-visible rows are merged
  // into that list by id, and a merge that reordered them would drop the host
  // out of a five-face pile on a busy event. There is no join timestamp on the
  // client objects to re-sort by, so this is the one thing worth pinning.
  const going = [...approved].sort(
    (a, b) => Number(b.id === event.host_id) - Number(a.id === event.host_id)
  );

  return (
    <ScrollView
      style={styles.face}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      // The card's pan claims the horizontal axis and fails on vertical while
      // this face is up (see DealtCard's gesture block), so a swipe still
      // passes/saves from the back and this scroll owns everything vertical.
      nestedScrollEnabled
    >
      {/* The back is a face of the same object, not a separate screen, and it
          has to say which event it belongs to. Without this it opened on a bare
          "ABOUT" heading over body copy — you had turned the card over and lost
          all sense of what you were reading about. The front carries the photo,
          so this is deliberately typographic: the title, then the same
          when · where · distance line, and nothing else competing. */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={3}>
          {event.title}
        </Text>
        <Text style={styles.headerMeta} numberOfLines={2}>
          {[
            formatEventWhen(event.starts_at),
            event.location_name ? neighbourhood(event.location_name) : null,
            event.distance_m != null ? formatDistance(event.distance_m) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      {/* Both ported verbatim from EventBottomSheet.tsx:1315-1336. Unlike the
          gate messaging in the primary action (which only a non-member ever
          sees, by definition — a host/participant has nothing to join), these
          render for EVERYONE the event is true for, host and members
          included. Women-only in particular is safety-relevant information,
          not just a join gate, and hiding it once someone is already in was
          exactly the regression this restores. */}
      {tooFar && (
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
        <View style={styles.section}>
          <SectionLabel>About</SectionLabel>
          <Text style={styles.description}>{event.description}</Text>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.rosterHead}>
          <SectionLabel>{"Who's going"}</SectionLabel>
          {event.participant_count > 0 && (
            <Text style={styles.rosterCount}>
              {event.participant_count}
              {event.max_people ? `/${event.max_people}` : ''}
            </Text>
          )}
        </View>

        {/* One face pile either way. It used to be a column of full-width
            name rows for members — on a card whose whole job is to be
            glanceable, twelve attendees pushed everything under them off the
            bottom, and the names were the least of what you came for. The
            overlapping stack is what every other surface in the app already
            uses to say "these people"; the list itself is a tap away.

            What still differs is only what sits under it: members get the way
            through to the names, everyone else gets the gate. The roster stays
            behind joining, as it always has — the preview faces are public,
            the list is not. */}
        <View style={styles.rosterGate}>
          <AttendeeStack
            people={going}
            count={event.participant_count}
            max={5}
            size={ROSTER_AVATAR}
            emptyLabel="Be the first to join"
          />
          {isMember ? (
            going.length > 0 &&
            onSeeAll && (
              <PressableScale
                scaleTo={0.96}
                onPress={onSeeAll}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="See all attendees"
                style={styles.seeAllRow}
              >
                <Text style={styles.seeAll}>See all attendees</Text>
                <Icon
                  name="chevronRight"
                  size={15}
                  color={COLORS.primary}
                  strokeWidth={2.5}
                />
              </PressableScale>
            )
          ) : (
            <Text style={styles.rosterHint}>
              Join to see the full list of attendees
            </Text>
          )}
        </View>
      </View>

      {secondaryActions && (
        <View style={styles.actions}>{secondaryActions}</View>
      )}
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  // `surface`, not `white`. The token `white` means the colour white and stays
  // white on both themes — correct for a glyph on coral, wrong for the sheet a
  // card's back is made of. On the dark theme this was a white page with white
  // text on it: everything except the avatars and the two ink buttons vanished.
  face: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: SPACING[5], paddingBottom: SPACING[8], gap: SPACING[5] },
  section: { gap: SPACING[2.5] },
  // Verbatim from EventBottomSheet.tsx's `premiumPill`/`premiumPillText`/
  // `womenOnlyPill`/`womenOnlyText`.
  premiumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING[1.5],
    paddingHorizontal: SPACING[2.5],
    paddingVertical: SPACING[1.5],
    borderRadius: RADIUS.full,
    backgroundColor: premiumGoldTint(),
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
    // Was a bare `rgba(149,9,82,0.10)` ported verbatim from the deleted sheet —
    // a magenta left over from an older `secondary`, which no longer matched
    // the `COLORS.secondary` the pill's own text uses. `secondaryTint` is that
    // colour's named tint.
    backgroundColor: COLORS.secondaryTint,
  },
  womenOnlyText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.secondary,
  },
  description: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 21,
    color: COLORS.textSecondary,
  },
  rosterHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rosterCount: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },
  rosterGate: { gap: SPACING[2] },
  // `alignSelf: 'flex-start'` so the touch target is the words, not the width
  // of the card — a full-bleed invisible button under a face pile eats the
  // taps meant for the faces.
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING[1],
  },
  seeAll: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.primary,
  },
  rosterHint: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  // The back's own identity block — see the comment at its render site.
  header: { gap: SPACING[1.5], marginBottom: SPACING[1] },
  title: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.title,
    lineHeight: TYPE_SIZE.title * 1.2,
    letterSpacing: -0.3,
    color: COLORS.textPrimary,
  },
  headerMeta: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },
  actions: { gap: SPACING[2.5] },
}));
