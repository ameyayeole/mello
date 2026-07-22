import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { RADIUS, SPACING } from '@/constants/spacing';
import { NearbyEvent } from '@/types/models';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatEventWhen } from '@/utils/time';
import { CategoryTile, Glass, PressableScale } from '@/components/ui';

// The compact event list row used by the dashboard and the profile tab:
// category tile with an emoji badge, title, time/attendee meta, and a trailing
// call-to-action pill.
//
// `cta` picks the label only. All three share the app's secondary (black)
// button treatment — coral is reserved for major CTAs, and an inline row
// affordance isn't one.
export type EventRowCta = 'manage' | 'view' | 'details' | 'chat';

const CTA_LABEL: Record<EventRowCta, string> = {
  manage: 'Manage',
  view: 'View',
  details: 'View details',
  // Inbox search: the row is a conversation you're already in, not an event
  // to consider.
  chat: 'Open chat',
};

// How much weight the row's action carries. `strong` is the app's secondary
// (black) button — the default everywhere, and what every existing call site
// already renders. `quiet` is the tertiary treatment, for a row sitting next to
// another whose action matters more: on the home screen "Manage" your own event
// should outrank "Details" on someone else's.
//
// Never coral. Coral is a screen's one major CTA and an inline row affordance
// is not that.
export type EventRowTone = 'strong' | 'quiet';

// The eyebrow above the title: what this event is *to you*. Coral for the ones
// you're responsible for, blue for the ones you're only attending.
//
// Blue rather than green because the pair has to survive red/green colour
// blindness — with coral as the other half, green is the one choice that
// collapses. The dot is not decoration either: it is the redundant channel that
// keeps the two distinguishable when the hue isn't.
export type EventRowEyebrow = 'hosting' | 'attending';

const EYEBROW: Record<EventRowEyebrow, { label: string; color: string }> = {
  hosting: { label: 'Hosting', color: COLORS.primary },
  attending: { label: 'Attending', color: COLORS.attending },
};

export default function EventRow({
  event,
  cta = 'details',
  tone = 'strong',
  elevated = false,
  eyebrow,
  photo = false,
  glass = false,
  onDark = false,
  onPress,
}: {
  event: NearbyEvent;
  cta?: EventRowCta;
  tone?: EventRowTone;
  // The dashboard floats these rows over a scrolling feed and wants a lift;
  // the profile tab lists them flat inside an already-grouped section.
  elevated?: boolean;
  // Omit for a row that needs no framing — the profile tab already groups its
  // rows under a heading that says which kind they are.
  eyebrow?: EventRowEyebrow;
  // Show the event's own photo as the thumbnail instead of its category tile.
  // Off by default so existing call sites are untouched.
  photo?: boolean;
  // Frosted rather than solid white, for rows sitting over <AppBackground>.
  glass?: boolean;
  // Inverted, for rows nested in a dark frosted pane (the profile sheet). Not a
  // second component: it is the same row with the ink ramp flipped, and ink
  // text on that sheet is simply unreadable. No blur of its own — the pane it
  // sits in is already blurred; see the `fillOnDark` note in COLORS.
  onDark?: boolean;
  onPress: () => void;
}) {
  const emoji = ACTIVITY_MAP[event.activity]?.emoji ?? '📍';
  const cat = categoryStyle(event.activity);
  const mark = eyebrow ? EYEBROW[eyebrow] : null;
  // `photo` is a request, not a guarantee — an event whose image failed to
  // upload still has to render something, and the category tile is what that
  // something has always been.
  const showPhoto = photo && !!event.image_url;

  const body = (
    <>
      <View style={styles.thumb}>
        {showPhoto ? (
          <Image
            source={{ uri: event.image_url! }}
            style={styles.thumbPhoto}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <CategoryTile activity={event.activity} size={52} radius={14} />
        )}
        <View style={[styles.emojiBadge, { backgroundColor: cat.accent }]}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {mark && (
          <View style={styles.eyebrowRow}>
            <View style={[styles.eyebrowDot, { backgroundColor: mark.color }]} />
            <Text style={[styles.eyebrowText, { color: mark.color }]}>
              {mark.label}
            </Text>
          </View>
        )}
        <Text style={[styles.title, onDark && styles.titleOnDark]} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={[styles.meta, onDark && styles.metaOnDark]} numberOfLines={1}>
          {formatEventWhen(event.starts_at)}
          {event.participant_count ? ` · ${event.participant_count} going` : ''}
        </Text>
      </View>

      {/* On dark the CTA is the tertiary (white) treatment whatever the tone:
          both ink fills disappear into the sheet. */}
      <View
        style={[
          styles.pill,
          tone === 'quiet' && styles.pillQuiet,
          onDark && styles.pillOnDark,
        ]}
      >
        <Text
          style={[
            styles.pillText,
            tone === 'quiet' && styles.pillTextQuiet,
            onDark && styles.pillTextQuiet,
          ]}
        >
          {CTA_LABEL[cta]}
        </Text>
      </View>
    </>
  );

  if (glass) {
    return (
      <PressableScale onPress={onPress} scaleTo={0.98}>
        <Glass tier="panel" radius={RADIUS['2xl']} style={styles.glassRow}>
          {body}
        </Glass>
      </PressableScale>
    );
  }

  return (
    <PressableScale
      style={[
        styles.row,
        elevated && styles.rowElevated,
        onDark && styles.rowOnDark,
      ]}
      onPress={onPress}
      scaleTo={0.98}
    >
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: RADIUS.xl,
    padding: SPACING[2.5],
  },
  rowOnDark: {
    backgroundColor: COLORS.fillOnDark,
    borderColor: COLORS.borderOnDark,
  },
  rowElevated: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  // Same box as the solid row, but the fill and border come from <Glass>.
  glassRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    padding: SPACING[2.5],
  },
  thumb: { width: 52, height: 52 },
  // 14, matching CategoryTile's radius so swapping the photo in doesn't change
  // the row's silhouette.
  thumbPhoto: { width: 52, height: 52, borderRadius: RADIUS.md },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    marginBottom: SPACING[1],
  },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3 },
  eyebrowText: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.nano,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  emojiBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: TYPE_SIZE.micro },
  body: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.body,
    letterSpacing: -0.2,
    color: COLORS.textPrimary,
  },
  titleOnDark: { color: COLORS.white },
  meta: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
    marginTop: SPACING[0.5],
  },
  metaOnDark: { color: COLORS.textOnDarkMuted },

  // Rounded rectangle matching Button's sm radius — the app has no pill
  // buttons. Colours mirror Button's `secondary` variant.
  pill: {
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1.5],
  },
  pillText: { fontFamily: FONTS.heavy, fontSize: TYPE_SIZE.nano, color: COLORS.white },
  // Button's `tertiary` treatment, for the rows whose action is low-stakes.
  pillQuiet: { backgroundColor: COLORS.inkSubtle },
  pillOnDark: { backgroundColor: COLORS.white },
  pillTextQuiet: { color: COLORS.textPrimary },
});
