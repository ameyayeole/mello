import { type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { RADIUS, SPACING } from '@/constants/spacing';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { eventImageUri } from '@/utils/events';
import { formatEventWhen } from '@/utils/time';
import { formatDistance } from '@/utils/distance';
import { useNearbyEvents } from '@/hooks/useNearbyEvents';
import type { EventDetail, NearbyEvent } from '@/types/models';
import {
  ActivityGlyph,
  AttendeeStack,
  Avatar,
  CategoryPill,
  PressableScale,
  SectionLabel,
  Tag,
} from '@/components/ui';

export interface EventCardBackProps {
  event: EventDetail;
  // Whether the viewer is in this event (approved participant or host) — the
  // gate the roster is behind. Handed in rather than recomputed from
  // `event.participants` + a user id, since the front face and whatever wires
  // this card together already have to know it.
  isMember: boolean;
  // "Happening near you" tap — opens that event. What that means (a new dealt
  // card, a push) is the composing screen's call, not this face's.
  onOpenEvent: (id: string) => void;
  // The non-pinned actions (Open chat, Check in, pending requests, Leave…).
  // This face renders them; it owns none of the mutations behind them — see
  // EventBottomSheet.tsx's "Actions" block for the set this replaces.
  secondaryActions?: ReactNode;
}

// The roster row's avatar size — matches the sheet's `GOING_AVATAR`.
const ROSTER_AVATAR = 36;

// A compact card for the "happening near you" rail: photo on top with the
// category pill on it, then title + when/distance on a white body below. A
// pared-down cousin of the home screen's NearbyCard — no join/save affordances,
// since the whole card is a tap that opens the event. Text sits on white (not
// over a scrim) so it's always legible and the photo reads cleanly.
//
// Ported verbatim from EventBottomSheet.tsx — self-contained, no dependency on
// the sheet's drag axis.
function NearbyMini({
  event,
  onPress,
}: {
  event: NearbyEvent;
  onPress: () => void;
}) {
  const activity = ACTIVITY_MAP[event.activity];
  const cat = categoryStyle(event.activity);
  // The event's own photo, or the host's face when it has none — see
  // `eventImageUri`. The glyph below is now genuinely the last resort.
  const imageUri = eventImageUri(event);
  return (
    <PressableScale style={styles.nearbyMini} onPress={onPress} scaleTo={0.97}>
      <View style={[styles.nearbyMiniImage, { backgroundColor: cat.tint }]}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            // Stable key so expo-image doesn't blank when the row recycles
            // inside the nested horizontal scroll.
            recyclingKey={event.id}
          />
        ) : (
          // Photoless event: the activity glyph on its category tint, so the
          // card reads as intentional rather than a blank/broken image.
          <View style={styles.nearbyMiniPlaceholder}>
            <ActivityGlyph
              activity={event.activity}
              size={34}
              color={cat.accent}
            />
          </View>
        )}
        <View style={styles.nearbyMiniPill}>
          <CategoryPill
            emoji={activity?.emoji ?? '📍'}
            label={activity?.label}
            color={cat.accent}
          />
        </View>
      </View>
      <View style={styles.nearbyMiniBody}>
        <Text style={styles.nearbyMiniTitle} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={styles.nearbyMiniMeta} numberOfLines={1}>
          {formatEventWhen(event.starts_at)}
          {event.distance_m != null
            ? ` · ${formatDistance(event.distance_m)}`
            : ''}
        </Text>
      </View>
    </PressableScale>
  );
}

// The card's back — the only scrolling surface in the whole dealt-card design.
// Description, the full roster (gated behind membership), the nearby rail,
// then whatever secondary actions the composing screen hands in.
export function EventCardBack({
  event,
  isMember,
  onOpenEvent,
  secondaryActions,
}: EventCardBackProps) {
  const approved = event.participants.filter((p) => p.status === 'approved');

  // The card's person rows. Order comes from the server — `event_attendees_preview`
  // ranks by `ep.joined_at, pr.id`, and migration 043 gives the host a
  // participant row at creation time, so the host already sorts first and the
  // rest follow by join time. The pin below is belt-and-braces: the RLS-visible
  // rows are merged into that list by id, and if a merge ever reordered them the
  // host tag would silently land on the wrong person. There is no join timestamp
  // on the client objects to re-sort by, so this is the one thing worth pinning.
  const goingRows = [...approved].sort(
    (a, b) => Number(b.id === event.host_id) - Number(a.id === event.host_id)
  );

  // "Happening near you" rail. Reuses the map/home nearby query (keyed on the
  // user's location + radius), drops the event you're already looking at, and
  // floats same-activity events to the front so the rail reads as "more like
  // this". Empty until location is on — the section hides itself then.
  const { data: nearbyRaw } = useNearbyEvents();
  const nearbyEvents = (nearbyRaw ?? [])
    .filter((e) => e.id !== event.id)
    .sort(
      (a, b) =>
        Number(b.activity === event.activity) -
        Number(a.activity === event.activity)
    )
    .slice(0, 8);

  return (
    <ScrollView
      style={styles.face}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      // The card's own pan is disabled while this face is showing (see
      // DealtCard) so there is nothing for this to fight on iOS; Android still
      // needs the nested-scrolling flag for the horizontal rail sitting inside
      // this vertical one.
      nestedScrollEnabled
    >
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

        {isMember ? (
          goingRows.length > 0 ? (
            goingRows.map((person) => (
              <View key={person.id} style={styles.rosterRow}>
                <Avatar
                  name={person.name}
                  photoUrl={person.photo_url}
                  size={ROSTER_AVATAR}
                />
                <Text style={styles.rosterName} numberOfLines={1}>
                  {person.name}
                </Text>
                {person.id === event.host_id && (
                  <Tag label="Host" color={COLORS.primary} />
                )}
              </View>
            ))
          ) : (
            <Text style={styles.rosterHint}>Be the first to join</Text>
          )
        ) : (
          // Not joined: the face pile and the gate. The roster stays behind
          // joining, as it always has — the preview faces are public, the
          // list is not. Same gate `GoingStack` applied in the sheet.
          <View style={styles.rosterGate}>
            <AttendeeStack
              people={approved}
              count={event.participant_count}
              max={5}
              size={ROSTER_AVATAR}
              emptyLabel="Be the first to join"
            />
            <Text style={styles.rosterHint}>
              Join to see the full list of attendees
            </Text>
          </View>
        )}
      </View>

      {nearbyEvents.length > 0 && (
        <View style={styles.section}>
          <SectionLabel>Happening near you</SectionLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            contentContainerStyle={styles.nearbyRail}
          >
            {nearbyEvents.map((e) => (
              <NearbyMini key={e.id} event={e} onPress={() => onOpenEvent(e.id)} />
            ))}
          </ScrollView>
        </View>
      )}

      {secondaryActions && (
        <View style={styles.actions}>{secondaryActions}</View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  face: { flex: 1, backgroundColor: COLORS.white },
  content: { padding: SPACING[5], paddingBottom: SPACING[8], gap: SPACING[5] },
  section: { gap: SPACING[2.5] },
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
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  rosterName: {
    flex: 1,
    minWidth: 0,
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  rosterGate: { gap: SPACING[2] },
  rosterHint: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  // ── Happening near you rail ─────────────────────────────────────────────────
  // Bleeds a touch past the content padding so a card can sit half-off the right
  // edge, hinting there's more to swipe. Trailing padding keeps the last card
  // clear of the edge.
  nearbyRail: { gap: SPACING[3], paddingRight: SPACING[5] },
  nearbyMini: {
    width: 180,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  nearbyMiniImage: { height: 104, backgroundColor: '#E3E1E4' },
  nearbyMiniPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyMiniPill: {
    position: 'absolute',
    top: SPACING[2],
    left: SPACING[2],
  },
  nearbyMiniBody: { padding: SPACING[3], gap: SPACING[0.5] },
  nearbyMiniTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
  },
  nearbyMiniMeta: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  actions: { gap: SPACING[2.5] },
});
