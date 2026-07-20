import { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { getPublicWrap } from '@/services/wrap.service';
import { ACTIVITY_MAP } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import {
  Avatar,
  Icon,
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
          <ActivityIndicator color={COLORS.primary} />
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
              <Text style={{ fontSize: 26 }}>{emoji}</Text>
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
    gap: 6,
    padding: 30,
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  hero: { alignItems: 'center', gap: 5, paddingHorizontal: 24, paddingVertical: 8 },
  heroEmoji: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  heroTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 21,
    letterSpacing: -0.42,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  heroMeta: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: COLORS.textSecondary,
  },
  bestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 100,
    backgroundColor: COLORS.primaryTint,
    marginTop: 6,
  },
  bestChipText: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    color: COLORS.primary,
  },
  pager: { paddingHorizontal: 18, gap: 10, paddingVertical: 14 },
  photoCard: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    shadowColor: '#0F182C',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  photo: { flex: 1, backgroundColor: COLORS.primaryTint },
  photoFooter: { padding: 12, backgroundColor: COLORS.surface },
  uploaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  uploaderName: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: COLORS.textPrimary,
  },
  caption: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  likePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    height: 26,
    borderRadius: 100,
    backgroundColor: COLORS.primaryTint,
  },
  likeText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    color: COLORS.primary,
  },
});
