import { View, Text, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { Image } from 'expo-image';
import { ExploreEvent } from '@/types/models';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { relativeTime, formatEventWhen } from '@/utils/time';
import { formatDistance } from '@/utils/distance';
import { shortLocation } from '@/utils/location';
import { eventImageUri } from '@/utils/events';
import { BOOST_ACCENT, BOOST_EMOJI, BOOST_TINT, isBoosted } from '@/utils/boost';
import { Avatar, Icon, VerifiedBadge, PressableScale } from '@/components/ui';

// Post-style card: host header → text → meta → social proof, photo last.
export default function ExploreEventCard({
  event,
  onPress,
}: {
  event: ExploreEvent;
  onPress: () => void;
}) {
  const activity = ACTIVITY_MAP[event.activity];
  const cat = categoryStyle(event.activity);
  const imageUri = eventImageUri(event);

  const subBits = [
    relativeTime(event.created_at),
    event.distance_m != null ? formatDistance(event.distance_m) : null,
  ].filter(Boolean);

  return (
    <PressableScale style={styles.card} onPress={onPress} scaleTo={0.98}>
      <View style={styles.body}>
        {/* Host header */}
        <View style={styles.hostRow}>
          <Avatar
            name={event.host_name}
            photoUrl={event.host_photo_url}
            size={40}
          />
          <View style={styles.hostText}>
            <View style={styles.hostNameRow}>
              <Text style={styles.hostName} numberOfLines={1}>
                {event.host_name}
              </Text>
              <VerifiedBadge size={13} />
            </View>
            <Text style={styles.hostSub} numberOfLines={1}>
              {subBits.join(' · ')}
            </Text>
          </View>
          {isBoosted(event) && (
            <View style={styles.boostBadge}>
              <Text style={styles.boostBadgeText}>{BOOST_EMOJI} Boosted</Text>
            </View>
          )}
          <View style={[styles.categoryBadge, { backgroundColor: cat.tint }]}>
            <Text style={styles.categoryEmoji}>{activity.emoji}</Text>
          </View>
        </View>

        {/* Post text */}
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        {event.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {event.description}
          </Text>
        ) : null}

        {/* When & where */}
        <View style={styles.metaRow}>
          <Icon name="clock" size={13} color="rgba(15,24,44,0.55)" />
          <Text style={styles.metaText}>{formatEventWhen(event.starts_at)}</Text>
          {event.location_name ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={[styles.metaText, { flexShrink: 1 }]} numberOfLines={1}>
                {shortLocation(event.location_name)}
              </Text>
            </>
          ) : null}
        </View>

        {/* Social proof */}
        {(event.participant_count > 0 || event.friends_count > 0) && (
          <View style={styles.footer}>
            <View style={styles.attendeeStack}>
              {Array.from({
                length: Math.min(event.participant_count, 3),
              }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.attendeeRing, i > 0 && { marginLeft: -8 }]}
                >
                  <Avatar name={String.fromCharCode(65 + i)} size={22} />
                </View>
              ))}
            </View>
            <Text style={styles.goingText}>
              {event.participant_count}
              {event.max_people ? `/${event.max_people}` : ''} going
              {event.friends_count > 0
                ? ` · ${event.friends_count} ${
                    event.friends_count === 1 ? 'friend' : 'friends'
                  }`
                : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Photo last, full width */}
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.banner}
          contentFit="cover"
          transition={200}
        />
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    shadowColor: '#0F182C',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  body: { padding: SPACING[3.5], gap: SPACING[2] },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  hostText: { flex: 1, minWidth: 0 },
  hostNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1] },
  hostName: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  hostSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: 'rgba(15,24,44,0.45)',
    marginTop: SPACING[0.5],
  },
  categoryBadge: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: { fontSize: TYPE_SIZE.body },
  boostBadge: {
    backgroundColor: BOOST_TINT,
    paddingHorizontal: SPACING[2],
    paddingVertical: SPACING[1],
    borderRadius: RADIUS.full,
  },
  boostBadgeText: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.micro,
    color: BOOST_ACCENT,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyLg,
    lineHeight: 21,
    color: COLORS.textPrimary,
  },
  description: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 18,
    color: COLORS.textSecondary,
    marginTop: -3,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1] },
  metaText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: 'rgba(15,24,44,0.55)',
  },
  metaDot: { color: 'rgba(15,24,44,0.35)' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },
  attendeeStack: { flexDirection: 'row', alignItems: 'center' },
  attendeeRing: {
    borderRadius: RADIUS.sm,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  goingText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: 'rgba(15,24,44,0.5)',
  },
  banner: {
    width: '100%',
    height: 170,
    backgroundColor: COLORS.background,
  },
});
