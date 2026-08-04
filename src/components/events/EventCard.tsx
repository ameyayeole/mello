import { type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
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
import { isPremium } from '@/utils/premium';
import type { EventParticipant, NearbyEvent } from '@/types/models';
import {
  ActivityGlyph,
  AttendeeStack,
  Avatar,
  CategoryPill,
  Glass,
  IconButton,
  PremiumBadge,
  VerifiedBadge,
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
  // How much of the card's furniture is showing. 0 = the bare photo, which is
  // what a card looks like parked in the map's corner; 1 = the full card. The
  // deck drives this from its own expand progress so the pane fades in over
  // the last part of the growth, and the photo element never swaps — that is
  // what makes it read as one object getting bigger rather than a small card
  // being replaced by a large one.
  //
  // A `SharedValue`, not a plain number: the deck updates this every frame of
  // the expand gesture, off the same shared value that also drives every
  // card's position and scale. A plain number would make that a prop change
  // on every frame, re-rendering the whole card (host row, title, going
  // count) for a fade only the pane needs — the per-frame-JS-work this
  // codebase avoids elsewhere (see DealtCard.tsx). Read through
  // `useAnimatedStyle` instead, the fade stays on the UI thread and
  // `EventCard` never re-renders because of it.
  //
  // Optional and defaulting to fully shown: every other caller renders a
  // finished card and never passes this.
  emerge?: SharedValue<number>;
}


export function EventCard({
  event,
  blurred = true,
  action,
  onSave,
  onShare,
  saved,
  emerge,
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

  // Undefined `emerge` (every caller today) reads as 1 here, not via a
  // fallback `useSharedValue` — matching the `revealX` prop on
  // `MessageBubble`, the codebase's other optional-shared-value prop.
  const emergeStyle = useAnimatedStyle(() => ({
    opacity: emerge ? emerge.value : 1,
  }));

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

      {/* `emerge` wraps the pane, not the fill inside `Glass` itself: `Glass`
          renders a plain RN `View`, and a Reanimated style only keeps
          updating a component created through `Animated.View` /
          `createAnimatedComponent` — handing it to a plain `View` would just
          paint whatever `emerge` was on the render that mounted it. */}
      <Animated.View style={[styles.paneWrap, emergeStyle]}>
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
            {/* Name, badges, then "is hosting" — the same order the sheet and
                the home rail use, so the badges read as belonging to the person
                rather than floating at the end of the row. The name is the only
                part that shrinks. */}
            <Text style={styles.hostName} numberOfLines={1}>
              {hostName ?? 'Someone'}
            </Text>
            {/* Both ported from EventBottomSheet.tsx:1257-1258, where they sat on
                the same host row. They survived the sheet's deletion on the
                BROWSE cards (app/(tabs)/index.tsx:246) but not
                on the detail surface — so the two signals that most change a join
                decision were missing from the one screen where that decision is
                made. `host_verified` is a flattened feed field; `host` is only
                on `EventDetail`, so a background card in a dealt stack shows the
                tick and no crown, which is correct rather than a gap. */}
            {event.host_verified && <VerifiedBadge size={13} />}
            {isPremium(event.host) && <PremiumBadge size={12} />}
            <Text style={styles.hostText} numberOfLines={1}>
              is hosting
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
      </Animated.View>
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
  // Sits just above the pane, centred — out of the way of the category pill and
  // the save/share chips, and reading as part of the photo rather than the
  // content.
  // Hangs off the card's top-left corner, above the category pill. Negative
  // insets so it overhangs the card's own edge like a tab rather than sitting
  // inside the photo.
  flipHint: {
    position: 'absolute',
    top: SPACING[10],
    left: -SPACING[1.5],
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    paddingHorizontal: SPACING[2.5],
    paddingVertical: SPACING[1.5],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  flipHintText: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textPrimary,
  },
  // Fills the card exactly like `pane` used to as a direct absolute child of
  // `card` — `pane`'s own left/right/bottom insets still do the positioning,
  // this only exists so `emerge` has an `Animated.View` to land on.
  paneWrap: { ...StyleSheet.absoluteFill },
  pane: {
    position: 'absolute',
    left: SPACING[2],
    right: SPACING[2],
    bottom: SPACING[2],
    padding: SPACING[3],
    gap: SPACING[2],
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  // The name shrinks; the badges and "is hosting" do not, so a long name
  // truncates rather than pushing the badges off the row.
  hostName: { flexShrink: 1, fontFamily: FONTS.medium, fontSize: TYPE_SIZE.caption, color: COLORS.white, opacity: 0.85 },
  hostText: { fontFamily: FONTS.medium, fontSize: TYPE_SIZE.caption, color: COLORS.white, opacity: 0.85 },
  // `title` (job-named, matching TYPE.title) rather than the brief sketch's
  // nonexistent `TYPE_SIZE.lg` — see the task report for why.
  title: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.title, lineHeight: TYPE_SIZE.title * 1.2, letterSpacing: -0.2, color: COLORS.white },
  // `caption` — "meta rows, chips, counters" is this text's own job description
  // in typography.ts — rather than the sketch's nonexistent `TYPE_SIZE.xs`.
  meta: { fontFamily: FONTS.medium, fontSize: TYPE_SIZE.caption, color: COLORS.white, opacity: 0.85 },
  goingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING[2] },
});
