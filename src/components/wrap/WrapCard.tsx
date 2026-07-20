import { View, Text, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon, PressableScale } from '@/components/ui';
import { ACTIVITY_MAP } from '@/constants/activities';
import { ExploreWrap } from '@/types/models';

function endedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Wrapped today';
  if (days === 1) return 'Wrapped yesterday';
  return `Wrapped ${days} days ago`;
}

// Explore-feed card for a wrapped event: a mosaic of its 6 most-liked photos.
// Tap → the public wrap gallery.
export default function WrapCard({ wrap }: { wrap: ExploreWrap }) {
  const router = useRouter();
  const photos = wrap.top_photos.slice(0, 6);
  const [heroPhoto, ...rest] = photos;
  const emoji = ACTIVITY_MAP[wrap.activity]?.emoji ?? '📍';

  return (
    <PressableScale
      scaleTo={0.99}
      style={styles.card}
      onPress={() => router.push(`/wrap/${wrap.event_id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open the ${wrap.title} wrap gallery`}
    >
      <View style={styles.header}>
        <View style={styles.emojiTile}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {wrap.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {endedAgo(wrap.ended_at)}
            {wrap.location_name ? ` · ${wrap.location_name}` : ''}
          </Text>
        </View>
        <View style={styles.wrapChip}>
          <Icon name="camera" size={12} color={COLORS.primary} strokeWidth={2.2} />
          <Text style={styles.wrapChipText}>Wrap</Text>
        </View>
      </View>

      {heroPhoto && (
        <View style={styles.mosaic}>
          <Image
            source={{ uri: heroPhoto.url }}
            style={styles.hero}
            contentFit="cover"
            transition={150}
          />
          {rest.length > 0 && (
            <View style={styles.sideColumn}>
              {rest.slice(0, 2).map((p, i) => (
                <View key={p.id} style={styles.sideCell}>
                  <Image
                    source={{ uri: p.url }}
                    style={styles.sideImage}
                    contentFit="cover"
                    transition={150}
                  />
                  {i === 1 && rest.length > 2 && (
                    <View style={styles.moreOverlay}>
                      <Text style={styles.moreText}>+{rest.length - 2}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.footer}>
        <Icon name="heart" size={13} color={COLORS.primary} strokeWidth={2.2} />
        <Text style={styles.footerText}>
          The {Math.min(wrap.photo_count, 6)} best shots from the night · tap to view
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS['2xl'],
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING[3.5],
    gap: SPACING[3],
    shadowColor: '#0F182C',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  emojiTile: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: TYPE_SIZE.title },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.body,
    letterSpacing: -0.31,
    color: COLORS.textPrimary,
  },
  meta: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  wrapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    paddingHorizontal: SPACING[2],
    height: 26,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryTint,
  },
  wrapChipText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.primary,
  },
  mosaic: { flexDirection: 'row', gap: SPACING[1.5], height: 200 },
  hero: { flex: 2, borderRadius: RADIUS.lg, backgroundColor: COLORS.primaryTint },
  sideColumn: { flex: 1, gap: SPACING[1.5] },
  sideCell: { flex: 1, borderRadius: RADIUS.lg, overflow: 'hidden' },
  sideImage: { width: '100%', height: '100%', backgroundColor: COLORS.primaryTint },
  moreOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,24,44,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { fontFamily: FONTS.heavy, fontSize: TYPE_SIZE.sectionLg, color: '#fff' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  footerText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    flex: 1,
  },
});
