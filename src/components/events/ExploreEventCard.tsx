import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { ExploreEvent } from '@/types/models';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { relativeTime, formatEventTime } from '@/utils/time';
import { formatDistance } from '@/utils/distance';
import { Avatar, Icon, VerifiedBadge, PressableScale } from '@/components/ui';

// Google addresses arrive as "226, Halav Pool, Halav Pool, Mumbai, …" — keep
// just the first meaningful, non-repeated place name.
function shortLocation(name: string): string {
  const seen = new Set<string>();
  const parts = name
    .split(',')
    .map((s) => s.trim())
    .filter((p) => {
      const key = p.toLowerCase();
      if (!p || seen.has(key) || /^\d+[-/]?\d*$/.test(p)) return false;
      seen.add(key);
      return true;
    });
  return parts[0] ?? name;
}

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
          <Text style={styles.metaText}>{formatEventTime(event.starts_at)}</Text>
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
      {event.image_url ? (
        <Image
          source={{ uri: event.image_url }}
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
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#0F182C',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  body: { padding: 14, gap: 8 },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hostText: { flex: 1, minWidth: 0 },
  hostNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  hostName: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  hostSub: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: 'rgba(15,24,44,0.45)',
    marginTop: 1,
  },
  categoryBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: { fontSize: 15 },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    lineHeight: 21,
    color: COLORS.textPrimary,
  },
  description: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
    marginTop: -3,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: 'rgba(15,24,44,0.55)',
  },
  metaDot: { color: 'rgba(15,24,44,0.35)' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attendeeStack: { flexDirection: 'row', alignItems: 'center' },
  attendeeRing: {
    borderRadius: 13,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  goingText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: 'rgba(15,24,44,0.5)',
  },
  banner: {
    width: '100%',
    height: 170,
    backgroundColor: COLORS.background,
  },
});
