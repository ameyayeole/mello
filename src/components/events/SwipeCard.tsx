import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { ExploreEvent } from '@/types/models';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { formatEventTime } from '@/utils/time';
import { formatDistance } from '@/utils/distance';
import { shortLocation } from '@/utils/location';
import { BOOST_ACCENT, BOOST_EMOJI, isBoosted } from '@/utils/boost';
import { Avatar, Icon, VerifiedBadge } from '@/components/ui';

// One full-size card of the swipe deck: media on top (cover photo, or the
// category tint with a big emoji when there's none), details below. Tap
// anywhere to open the event's bottom sheet.
export default function SwipeCard({
  event,
  onPress,
}: {
  event: ExploreEvent;
  onPress?: () => void;
}) {
  const activity = ACTIVITY_MAP[event.activity];
  const cat = categoryStyle(event.activity);

  return (
    <Pressable style={styles.card} onPress={onPress} disabled={!onPress}>
      {/* Media */}
      <View style={[styles.media, { backgroundColor: cat.tint }]}>
        {event.image_url ? (
          <Image
            source={{ uri: event.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <Text style={styles.mediaEmoji}>{activity?.emoji ?? '📍'}</Text>
        )}
        {event.distance_m != null && (
          <View style={styles.distancePill}>
            <Icon name="location" size={12} color="#fff" strokeWidth={2.2} />
            <Text style={styles.distanceText}>
              {formatDistance(event.distance_m)}
            </Text>
          </View>
        )}
        {event.friends_count > 0 && (
          <View style={styles.friendsPill}>
            <Icon name="user" size={12} color="#fff" strokeWidth={2.2} />
            <Text style={styles.distanceText}>
              {event.friends_count}{' '}
              {event.friends_count === 1 ? 'friend going' : 'friends going'}
            </Text>
          </View>
        )}
        {isBoosted(event) && (
          <View style={styles.boostPill}>
            <Text style={styles.boostPillText}>{BOOST_EMOJI} Boosted</Text>
          </View>
        )}
      </View>

      {/* Details */}
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <View style={[styles.categoryChip, { backgroundColor: cat.tint }]}>
            <Text style={styles.categoryEmoji}>{activity?.emoji}</Text>
            <Text style={[styles.categoryLabel, { color: cat.accent }]}>
              {activity?.label ?? event.activity}
            </Text>
          </View>
          <Icon name="clock" size={13} color={COLORS.textSecondary} />
          <Text style={styles.metaText} numberOfLines={1}>
            {formatEventTime(event.starts_at)}
          </Text>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>

        {event.location_name ? (
          <View style={styles.locationRow}>
            <Icon name="pin" size={14} color={COLORS.textSecondary} />
            <Text style={styles.locationText} numberOfLines={1}>
              {shortLocation(event.location_name)}
            </Text>
          </View>
        ) : null}

        <View style={styles.hostRow}>
          <Avatar
            name={event.host_name}
            photoUrl={event.host_photo_url}
            size={34}
          />
          <View style={styles.hostText}>
            <View style={styles.hostNameRow}>
              <Text style={styles.hostName} numberOfLines={1}>
                {event.host_name}
              </Text>
              <VerifiedBadge size={13} />
            </View>
            <Text style={styles.goingText}>
              {event.participant_count}
              {event.max_people ? `/${event.max_people}` : ''} going
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    shadowColor: '#0F182C',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  media: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaEmoji: { fontSize: 88 },
  distancePill: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 100,
    backgroundColor: 'rgba(15,24,44,0.5)',
  },
  friendsPill: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 100,
    backgroundColor: 'rgba(15,24,44,0.5)',
  },
  distanceText: { fontFamily: FONTS.bold, fontSize: 12, color: '#fff' },
  boostPill: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 100,
    backgroundColor: BOOST_ACCENT,
  },
  boostPillText: { fontFamily: FONTS.heavy, fontSize: 12, color: '#fff' },
  body: { padding: 18, paddingTop: 14, gap: 9 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 100,
    marginRight: 4,
  },
  categoryEmoji: { fontSize: 13 },
  categoryLabel: { fontFamily: FONTS.bold, fontSize: 12 },
  metaText: {
    flexShrink: 1,
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: COLORS.textSecondary,
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 23,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: COLORS.textPrimary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -2,
  },
  locationText: {
    flexShrink: 1,
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    color: COLORS.textSecondary,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 3,
  },
  hostText: { flex: 1, minWidth: 0 },
  hostNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hostName: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  goingText: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
});
