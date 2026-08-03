import { type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { RADIUS, SPACING } from '@/constants/spacing';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { eventImageUri } from '@/utils/events';
import { formatEventWhen } from '@/utils/time';
import { formatDistance } from '@/utils/distance';
import { neighbourhood } from '@/utils/location';
import type { EventParticipant, NearbyEvent } from '@/types/models';
import {
  ActivityGlyph,
  AttendeeStack,
  Avatar,
  CategoryPill,
  Glass,
  IconButton,
} from '@/components/ui';

export interface EventCardProps {
  // `NearbyEvent` covers both the feed/RPC row shape and `EventDetail` (which
  // extends it) — every field this component reads except one lives on
  // `NearbyEvent` already, including the optional `host`/`host_name` pair. The
  // exception is `participants`: only `EventDetail` carries the full roster,
  // so rather than widen this to `EventDetail | NearbyEvent` (which would make
  // `event.participants` a compile error on the plain feed rows that lack the
  // field entirely), it is folded in here as optional. `EventDetail` still
  // satisfies this type — a required array is assignable to an optional one.
  event: NearbyEvent & { participants?: EventParticipant[] };
  // Only the top card of a dealt stack gets a real blurred pane; see below.
  blurred?: boolean;
  // The primary action. Omitted for the inline feed card, which is a tap
  // target rather than a surface with a CTA on it.
  action?: ReactNode;
  onSave?: () => void;
  onShare?: () => void;
  saved?: boolean;
}

// The card object — full-bleed photo with the content on a smoked-glass pane
// inset from the edges.
//
// The SAME component is the community feed's inline card and the front face of
// a dealt card. That is the point: the deal then reads as the thing you
// touched opening, rather than one surface being swapped for another.
//
// `blurred` exists because a dealt stack renders five of these at once. Only
// the top one gets a real BlurView; the four behind get the flat fill, since
// they are shaded, rotated and mostly occluded and five backdrop blurs is a
// genuine iOS cost for a difference nobody can see.
export function EventCard({
  event,
  blurred = true,
  action,
  onSave,
  onShare,
  saved,
}: EventCardProps) {
  const activity = ACTIVITY_MAP[event.activity];
  const cat = categoryStyle(event.activity);
  const imageUri = eventImageUri(event);
  const going = event.participant_count ?? 0;
  const spots =
    event.max_people != null ? Math.max(event.max_people - going, 0) : null;
  // Both shapes carry one of these — flattened on feed rows, nested on
  // `EventDetail`'s `host`. Falls back to "Someone" rather than rendering
  // "undefined is hosting" on the rare row with neither.
  const hostName = event.host_name ?? event.host?.name;
  const hostPhoto = event.host_photo_url ?? event.host?.photo_url;

  return (
    <View style={styles.card}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          recyclingKey={event.id}
        />
      ) : (
        <View style={[styles.fallback, { backgroundColor: cat.tint }]}>
          <ActivityGlyph activity={event.activity} size={72} color={cat.accent} />
        </View>
      )}

      <View style={styles.pill}>
        <CategoryPill
          emoji={activity?.emoji ?? '📍'}
          label={activity?.label}
          color={cat.accent}
        />
      </View>

      {(onSave || onShare) && (
        <View style={styles.chips}>
          {onSave && (
            <IconButton
              icon={saved ? 'bookmarkFilled' : 'bookmark'}
              onPress={onSave}
              variant="onPhoto"
              accessibilityLabel={saved ? 'Remove from wishlist' : 'Save to wishlist'}
            />
          )}
          {onShare && (
            <IconButton icon="share" onPress={onShare} variant="onPhoto" accessibilityLabel="Share" />
          )}
        </View>
      )}

      <Glass
        tier="onPhoto"
        radius={RADIUS.lg}
        shadow={false}
        style={styles.pane}
        // Only the top card of a dealt stack (blurred=true) pays for a real
        // BlurView. Android has no backdrop blur at all, so this only changes
        // anything on iOS — which is exactly where the cost is.
        flat={!blurred}
      >
        <View style={styles.hostRow}>
          <Avatar name={hostName} photoUrl={hostPhoto} size={20} />
          <Text style={styles.hostText} numberOfLines={1}>
            {hostName ?? 'Someone'} is hosting
          </Text>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>

        <Text style={styles.meta} numberOfLines={1}>
          {[
            formatEventWhen(event.starts_at),
            event.location_name ? neighbourhood(event.location_name) : null,
            event.distance_m != null ? formatDistance(event.distance_m) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>

        <View style={styles.goingRow}>
          <AttendeeStack
            people={event.participants ?? []}
            count={going}
            max={3}
            size={20}
            // The row's own "N going" text (right below) already covers the
            // zero case; the stack's default "Be the first to join" bubble
            // would double up with it right next to it.
            emptyLabel={null}
          />
          <Text style={styles.meta}>
            {going} going{spots != null ? ` · ${spots} spots` : ''}
          </Text>
        </View>

        {action}
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: RADIUS['2xl'], overflow: 'hidden', backgroundColor: COLORS.surface },
  // `absoluteFillObject` isn't in this RN version's type declarations (only
  // the plain-object `absoluteFill` is) — spreading that instead.
  fallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', top: SPACING[2.5], left: SPACING[2.5] },
  chips: { position: 'absolute', top: SPACING[2.5], right: SPACING[2.5], flexDirection: 'row', gap: SPACING[1.5] },
  pane: {
    position: 'absolute',
    left: SPACING[2],
    right: SPACING[2],
    bottom: SPACING[2],
    padding: SPACING[3],
    gap: SPACING[2],
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  hostText: { flex: 1, fontFamily: FONTS.medium, fontSize: TYPE_SIZE.caption, color: COLORS.white, opacity: 0.85 },
  // `title` (job-named, matching TYPE.title) rather than the brief sketch's
  // nonexistent `TYPE_SIZE.lg` — see the task report for why.
  title: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.title, lineHeight: TYPE_SIZE.title * 1.2, letterSpacing: -0.2, color: COLORS.white },
  // `caption` — "meta rows, chips, counters" is this text's own job description
  // in typography.ts — rather than the sketch's nonexistent `TYPE_SIZE.xs`.
  meta: { fontFamily: FONTS.medium, fontSize: TYPE_SIZE.caption, color: COLORS.white, opacity: 0.85 },
  goingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING[2] },
});
