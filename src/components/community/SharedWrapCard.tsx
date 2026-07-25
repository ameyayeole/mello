import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { PressableScale, Icon } from '@/components/ui';
import { ACTIVITY_MAP } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';
import { useWrapCard } from '@/hooks/useWrapCard';
import { TextPostBody } from './TextPostBody';

const GUTTER = 3;

// The body of a shared_wrap post: an optional caption over a tappable preview of
// the referenced event's wrap — title + meta + a top-photos grid — that routes
// to the full wrap. Wraps are referenced, never merged; this copies no media.
export function SharedWrapCard({
  eventId,
  caption,
}: {
  eventId: string;
  caption: string;
}) {
  const router = useRouter();
  const wrap = useWrapCard(eventId);

  const captionEl = caption ? <TextPostBody body={caption} /> : null;

  if (wrap.isLoading || wrap.data === undefined) {
    return (
      <View>
        {captionEl}
        <View style={styles.card}>
          <View style={styles.skelTitle} />
          <View style={styles.skelGrid} />
        </View>
      </View>
    );
  }

  // Event deleted (ref_wrap_event_id → SET NULL leaves the id, but the RPC
  // returns no row) → a graceful dead-end, not a crash.
  if (wrap.data === null) {
    return (
      <View>
        {captionEl}
        <View style={[styles.card, styles.deadCard]}>
          <Text style={styles.deadText}>This wrap is no longer available.</Text>
        </View>
      </View>
    );
  }

  const w = wrap.data;
  const emoji = ACTIVITY_MAP[w.activity]?.emoji ?? '📍';
  const photos = w.top_photos.slice(0, 6);
  const meta = [
    w.location_name,
    `${w.photo_count} photo${Number(w.photo_count) === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View>
      {captionEl}
      <PressableScale
        scaleTo={0.99}
        style={styles.card}
        onPress={() => router.push(`/events/wrap/${eventId}`)}
        accessibilityRole="button"
        accessibilityLabel={`View the wrap for ${w.title}`}
      >
        <View style={styles.head}>
          <Text style={styles.emoji}>{emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {w.title}
            </Text>
            {meta ? (
              <Text style={styles.meta} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
        </View>

        {photos.length > 0 ? (
          <View style={styles.grid}>
            {photos.map((p) => (
              <Image
                key={p.id}
                source={{ uri: p.url }}
                style={styles.tile}
                contentFit="cover"
                transition={150}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.noPhotos}>No photos in this wrap yet.</Text>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>View wrap</Text>
          <Icon name="chevronRight" size={16} color={COLORS.textSecondary} />
        </View>
      </PressableScale>
    </View>
  );
}

const TILE = 92;

const styles = StyleSheet.create({
  card: {
    marginTop: SPACING[2],
    padding: SPACING[3],
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.inkFaint,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING[2.5],
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  emoji: { fontSize: TYPE_SIZE.titleLg },
  title: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textPrimary,
  },
  meta: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
    marginTop: SPACING[0.5],
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GUTTER },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.inkSubtle,
  },
  noPhotos: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textMuted,
  },
  footer: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1] },
  footerText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },

  deadCard: { alignItems: 'center' },
  deadText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textMuted,
    paddingVertical: SPACING[2],
  },
  skelTitle: {
    height: 18,
    width: '60%',
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.inkSubtle,
  },
  skelGrid: {
    height: TILE,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.inkSubtle,
  },
});
