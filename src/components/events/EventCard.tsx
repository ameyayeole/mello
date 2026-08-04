import { useEffect, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
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
  Icon,
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
  // Whether this card has a back face to turn to. Off by default: a card in a
  // feed or behind the top of a stack cannot flip, and promising otherwise is
  // worse than saying nothing.
  flippable?: boolean;
  // Stagger the pane's contents in. Only a freshly dealt card should — see
  // `PaneRow`.
  animateIn?: boolean;
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
// The hint's own component so its animation lives and dies with it — an
// always-running loop on a card that cannot flip would be four wasted
// animations behind every dealt stack.
//
// Shaped as the map teaser's "Up for it?" bubble on purpose: same white pill,
// same heavy caption, same tilt and soft shadow. Those two labels are the app's
// only two "this thing does something" tags, and making them the same object
// is cheaper to learn than two inventions. It sits ON the card's top-left
// corner rather than over the photo — the previous version floated across the
// middle of the image, which put it over whoever was in the picture.
function FlipHint() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withDelay(1600, withTiming(1, { duration: 900 })),
        withTiming(0, { duration: 900 })
      ),
      -1,
      false
    );
  }, [pulse]);
  // Breathes by lifting and settling rather than by fading: a label that
  // changes opacity reads as a rendering glitch, one that moves reads as alive.
  const style = useAnimatedStyle(() => ({
    transform: [
      { rotate: '-4deg' },
      { translateY: -pulse.value * 2 },
      { scale: 1 + pulse.value * 0.03 },
    ],
  }));
  return (
    <Animated.View style={[styles.flipHint, style]} pointerEvents="none">
      <Icon name="undo" size={11} color={COLORS.textPrimary} strokeWidth={2.6} />
      <Text style={styles.flipHintText}>Tap for details</Text>
    </Animated.View>
  );
}

// One line of the pane, arriving a beat after the one above it.
//
// Opt-in (`animateIn`), because this is only right for a card that was just
// dealt. A card in a feed, or one sitting behind the top of a stack, should
// simply BE there — content that assembles itself every time a list scrolls is
// noise, not delight. `PANE_STAGGER` is deliberately after the deal's own
// landing: the card arrives as an object first, and only then does what is
// printed on it settle in.
const PANE_STAGGER = 90;
const PANE_START = 260;

function PaneRow({
  index,
  animate,
  children,
}: {
  index: number;
  animate: boolean;
  children: ReactNode;
}) {
  if (!animate) return <>{children}</>;
  return (
    <Animated.View
      entering={FadeInUp.delay(PANE_START + index * PANE_STAGGER)
        .duration(320)
        .springify()
        .damping(16)}
    >
      {children}
    </Animated.View>
  );
}

export function EventCard({
  event,
  blurred = true,
  flippable = false,
  animateIn = false,
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

      {/* Tap-to-flip hint. Deliberately quiet: a small glass chip on the photo,
          just above the pane, that breathes once every few seconds rather than
          sitting there shouting. It is the only cue that this card has a back
          at all, and a card you can turn over is not a thing anyone expects —
          but it also must not compete with the join action a foot below it.
          Only shown when the card actually has a back to turn to. */}
      {flippable && <FlipHint />}

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
        <PaneRow index={0} animate={animateIn}>
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
        </PaneRow>

        <PaneRow index={1} animate={animateIn}>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        </PaneRow>

        <PaneRow index={2} animate={animateIn}>
        <Text style={styles.meta} numberOfLines={1}>
          {[
            formatEventWhen(event.starts_at),
            event.location_name ? neighbourhood(event.location_name) : null,
            event.distance_m != null ? formatDistance(event.distance_m) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        </PaneRow>

        <PaneRow index={3} animate={animateIn}>
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
        </PaneRow>

        <PaneRow index={4} animate={animateIn}>{action}</PaneRow>
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
