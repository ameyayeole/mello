import { useMemo } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { getPublicWrap } from '@/services/wrap.service';
import { ACTIVITY_MAP } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import {
  Avatar,
  Icon,
  Loader,
  PressableScale,
  Screen,
  ScreenHeader,
} from '@/components/ui';

// Public, read-only wrap gallery: the event's 6 most-liked photos, reachable
// from the Explore feed by anyone (data via SECURITY DEFINER RPC).
export default function PublicWrapScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { width } = useWindowDimensions();

  const wrapQuery = useQuery({
    queryKey: ['publicWrap', eventId],
    queryFn: () => getPublicWrap(eventId!),
    enabled: !!eventId,
    staleTime: 5 * 60_000,
  });

  const photos = wrapQuery.data ?? [];
  const eventMeta = photos[0];
  const emoji = eventMeta
    ? (ACTIVITY_MAP[eventMeta.activity]?.emoji ?? '📍')
    : '📍';
  const pageWidth = width - 36;

  const endedLabel = useMemo(() => {
    if (!eventMeta) return '';
    return new Date(eventMeta.ended_at).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });
  }, [eventMeta]);

  return (
    <Screen>
      <ScreenHeader title="Event wrap" tone="transparent" />

      {wrapQuery.isLoading ? (
        <View style={styles.center}>
          <Loader inline />
        </View>
      ) : photos.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>This wrap isn't public</Text>
          <Text style={styles.emptyText}>
            It may have expired or not have enough photos yet.
          </Text>
        </View>
      ) : (
        <>
          <Animated.View entering={FadeInDown.duration(350)} style={styles.hero}>
            <View style={styles.heroEmoji}>
              <Text style={{ fontSize: TYPE_SIZE.titleLg }}>{emoji}</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {eventMeta.title}
            </Text>
            <Text style={styles.heroMeta}>
              {endedLabel}
              {eventMeta.location_name ? ` · ${eventMeta.location_name}` : ''}
            </Text>
            <View style={styles.bestChip}>
              <Icon name="heart" size={12} color={COLORS.primary} strokeWidth={2.2} />
              <Text style={styles.bestChipText}>
                The {photos.length} best shots, picked by the people who were there
              </Text>
            </View>
          </Animated.View>

          <FlatList
            data={photos}
            keyExtractor={(p) => p.photo_id}
            horizontal
            pagingEnabled
            snapToInterval={pageWidth + 10}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pager}
            renderItem={({ item, index }) => (
              <Animated.View
                entering={FadeInDown.delay(100 + index * 60).duration(350)}
                style={[styles.photoCard, { width: pageWidth }]}
              >
                <Image
                  source={{ uri: item.url }}
                  style={styles.photo}
                  contentFit="cover"
                  transition={200}
                />
                <View style={styles.photoFooter}>
                  <PressableScale
                    scaleTo={0.96}
                    style={styles.uploaderRow}
                    onPress={() => router.push(`/friends/${item.uploader_id}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.uploader_name}'s profile`}
                  >
                    <Avatar
                      name={item.uploader_name}
                      photoUrl={item.uploader_photo_url}
                      size={30}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.uploaderName} numberOfLines={1}>
                        {item.uploader_name}
                      </Text>
                      {item.caption ? (
                        <Text style={styles.caption} numberOfLines={1}>
                          {item.caption}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.likePill}>
                      <Icon name="heart" size={12} color={COLORS.primary} strokeWidth={2.2} />
                      <Text style={styles.likeText}>{item.like_count}</Text>
                    </View>
                  </PressableScale>
                </View>
              </Animated.View>
            )}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[1.5],
    padding: SPACING[7],
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyLg,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  hero: { alignItems: 'center', gap: SPACING[1], paddingHorizontal: SPACING[6], paddingVertical: SPACING[2] },
  heroEmoji: {
    width: 54,
    height: 54,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[0.5],
  },
  heroTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    letterSpacing: -0.42,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  heroMeta: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  bestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    paddingHorizontal: SPACING[3],
    height: 30,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryTint,
    marginTop: SPACING[1.5],
  },
  bestChipText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.primary,
  },
  pager: { paddingHorizontal: SPACING[4], gap: SPACING[2.5], paddingVertical: SPACING[3.5] },
  photoCard: {
    borderRadius: RADIUS['3xl'],
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    shadowColor: '#0F182C',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  photo: { flex: 1, backgroundColor: COLORS.primaryTint },
  photoFooter: { padding: SPACING[3], backgroundColor: COLORS.surface },
  uploaderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  uploaderName: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
  },
  caption: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  likePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    paddingHorizontal: SPACING[2],
    height: 26,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryTint,
  },
  likeText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.primary,
  },
});
