import { View, Text, StyleSheet, Pressable } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { ExploreEvent } from '@/types/models';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatEventTime } from '@/utils/time';
import { formatDistance } from '@/utils/distance';
import { BOOST_ACCENT, BOOST_EMOJI, isBoosted } from '@/utils/boost';
import { Avatar, CategoryPill, VerifiedBadge } from '@/components/ui';

// One full-size card of the swipe deck: a full-bleed cover photo (or the
// category tint with a big emoji when there's none) with the title and host
// overlaid in white at the bottom. Tap anywhere to open the bottom sheet.
export default function SwipeCard({
  event,
  onPress,
}: {
  event: ExploreEvent;
  onPress?: () => void;
}) {
  const activity = ACTIVITY_MAP[event.activity];
  const cat = categoryStyle(event.activity);

  // "8 km · 3 friends going" tail under the host name.
  const tail = [
    event.distance_m != null ? formatDistance(event.distance_m) : null,
    event.friends_count > 0
      ? `${event.friends_count} ${event.friends_count === 1 ? 'friend' : 'friends'} going`
      : `${event.participant_count} going`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable style={styles.card} onPress={onPress} disabled={!onPress}>
      {event.image_url ? (
        <Image
          source={{ uri: event.image_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View style={[styles.fallback, { backgroundColor: cat.tint }]}>
          <Text style={styles.fallbackEmoji}>{activity?.emoji ?? '📍'}</Text>
        </View>
      )}

      {/* Bottom gradient so white text stays legible over any photo */}
      <Svg style={styles.gradient} pointerEvents="none">
        <Defs>
          <LinearGradient id="swipeFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.78} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#swipeFade)" />
      </Svg>

      {/* Top row: category + date */}
      <View style={styles.topLeft}>
        <CategoryPill
          emoji={activity?.emoji ?? '📍'}
          label={activity?.label ?? event.activity}
          color={cat.accent}
        />
      </View>
      <View style={styles.dateBadge}>
        <Text style={styles.dateText}>{formatEventTime(event.starts_at)}</Text>
      </View>

      {/* Bottom overlay */}
      <View style={styles.overlay}>
        {isBoosted(event) && (
          <View style={styles.boostPill}>
            <Text style={styles.boostPillText}>{BOOST_EMOJI} Boosted</Text>
          </View>
        )}
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        <View style={styles.hostRow}>
          <Avatar name={event.host_name} photoUrl={event.host_photo_url} size={24} />
          <Text style={styles.hostName} numberOfLines={1}>
            {event.host_name}
          </Text>
          {event.host_verified && <VerifiedBadge size={13} />}
          {tail ? <Text style={styles.tail} numberOfLines={1}>· {tail}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  fallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackEmoji: { fontSize: 96 },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
  },
  topLeft: { position: 'absolute', top: 16, left: 16 },
  dateBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(23,21,26,0.7)',
    paddingHorizontal: SPACING[2.5],
    paddingVertical: SPACING[1],
    borderRadius: RADIUS.full,
  },
  dateText: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.micro, color: '#fff' },
  boostPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    height: 26,
    paddingHorizontal: SPACING[2.5],
    borderRadius: RADIUS.full,
    backgroundColor: BOOST_ACCENT,
    marginBottom: SPACING[2.5],
  },
  boostPillText: { fontFamily: FONTS.heavy, fontSize: TYPE_SIZE.caption, color: '#fff' },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING[4],
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.titleLg,
    lineHeight: 26,
    letterSpacing: -0.5,
    color: '#fff',
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    marginTop: SPACING[2],
  },
  hostName: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: '#fff',
    flexShrink: 1,
  },
  tail: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: 'rgba(255,255,255,0.75)',
    flexShrink: 1,
  },
});
