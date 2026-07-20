import { View, Text, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { NearbyEvent } from '@/types/models';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatEventTime } from '@/utils/time';
import { CategoryTile, PressableScale } from '@/components/ui';

// The compact event list row used by the dashboard and the profile tab:
// category tile with an emoji badge, title, time/attendee meta, and a trailing
// call-to-action pill.
//
// `cta` picks the label only. All three share the app's secondary (black)
// button treatment — coral is reserved for major CTAs, and an inline row
// affordance isn't one.
export type EventRowCta = 'manage' | 'view' | 'details';

const CTA_LABEL: Record<EventRowCta, string> = {
  manage: 'Manage',
  view: 'View',
  details: 'View details',
};

export default function EventRow({
  event,
  cta = 'details',
  elevated = false,
  onPress,
}: {
  event: NearbyEvent;
  cta?: EventRowCta;
  // The dashboard floats these rows over a scrolling feed and wants a lift;
  // the profile tab lists them flat inside an already-grouped section.
  elevated?: boolean;
  onPress: () => void;
}) {
  const emoji = ACTIVITY_MAP[event.activity]?.emoji ?? '📍';
  const cat = categoryStyle(event.activity);

  return (
    <PressableScale
      style={[styles.row, elevated && styles.rowElevated]}
      onPress={onPress}
      scaleTo={0.98}
    >
      <View style={styles.thumb}>
        <CategoryTile activity={event.activity} size={52} radius={14} />
        <View style={[styles.emojiBadge, { backgroundColor: cat.accent }]}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatEventTime(event.starts_at)}
          {event.participant_count ? ` · ${event.participant_count} going` : ''}
        </Text>
      </View>

      <View style={styles.pill}>
        <Text style={styles.pillText}>{CTA_LABEL[cta]}</Text>
      </View>
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
  rowElevated: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  thumb: { width: 52, height: 52 },
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
  meta: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
    marginTop: SPACING[0.5],
  },

  // Rounded rectangle matching Button's sm radius — the app has no pill
  // buttons. Colours mirror Button's `secondary` variant.
  pill: {
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1.5],
  },
  pillText: { fontFamily: FONTS.heavy, fontSize: TYPE_SIZE.nano, color: COLORS.white },
});
