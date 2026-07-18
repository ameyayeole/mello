import { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSavedEvents, unsaveEvent } from '@/services/events.service';
import { useAuthStore } from '@/stores/authStore';
import EventBottomSheet, {
  EventBottomSheetRef,
} from '@/components/events/EventBottomSheet';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { formatEventTime } from '@/utils/time';
import { shortLocation } from '@/utils/location';
import { NearbyEvent, SavedEventItem } from '@/types/models';
import {
  Avatar,
  Button,
  Icon,
  IconButton,
  PressableScale,
} from '@/components/ui';

function WishlistCard({
  event,
  onPress,
  onRemove,
}: {
  event: SavedEventItem;
  onPress: () => void;
  onRemove: () => void;
}) {
  const activity = ACTIVITY_MAP[event.activity];
  const cat = categoryStyle(event.activity);

  return (
    <PressableScale style={styles.card} onPress={onPress} scaleTo={0.98}>
      {/* Media tile · title + time · remove bookmark */}
      <View style={styles.cardTop}>
        <View style={[styles.mediaTile, { backgroundColor: cat.tint }]}>
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
        </View>
        <View style={styles.cardHeading}>
          <Text style={styles.title} numberOfLines={2}>
            {event.title}
          </Text>
          <View style={styles.timeRow}>
            <Icon name="clock" size={14} color={COLORS.textSecondary} />
            <Text style={styles.timeText} numberOfLines={1}>
              {formatEventTime(event.starts_at)}
            </Text>
          </View>
        </View>
        <PressableScale
          scaleTo={0.85}
          style={styles.removeBtn}
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${event.title} from wishlist`}
        >
          <Icon name="bookmarkFilled" size={19} color={COLORS.primary} />
        </PressableScale>
      </View>

      {event.location_name ? (
        <View style={styles.locationRow}>
          <Icon
            name="location"
            size={14}
            color={COLORS.textPrimary}
            strokeWidth={2.2}
          />
          <Text style={styles.locationText} numberOfLines={1}>
            {shortLocation(event.location_name)}
          </Text>
        </View>
      ) : null}

      {event.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {event.description}
        </Text>
      ) : null}

      {/* Host */}
      <View style={styles.hostRow}>
        <Avatar
          name={event.host_name}
          photoUrl={event.host_photo_url}
          size={38}
        />
        <View>
          <Text style={styles.hostedBy}>Hosted By</Text>
          <Text style={styles.hostName} numberOfLines={1}>
            {event.host_name ?? 'Someone on Mello'}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Attendees · capacity · join CTA */}
      <View style={styles.footer}>
        {event.attendees.length > 0 && (
          <View style={styles.attendeeStack}>
            {event.attendees.slice(0, 3).map((a, i) => (
              <View
                key={a.id}
                style={[styles.attendeeRing, i > 0 && { marginLeft: -10 }]}
              >
                <Avatar name={a.name} photoUrl={a.photo_url} size={28} />
              </View>
            ))}
          </View>
        )}
        <Text style={styles.countText}>
          {event.participant_count}
          {event.max_people ? `/${event.max_people}` : ' going'}
        </Text>
        <View style={{ flex: 1 }} />
        <PressableScale
          scaleTo={0.94}
          style={styles.joinBtn}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Open ${event.title}`}
        >
          <Text style={styles.joinText}>
            {event.requires_approval ? 'Request to Join' : 'Join'}
          </Text>
        </PressableScale>
      </View>
    </PressableScale>
  );
}

// Everything the user bookmarked or swiped right on, with the full detail
// sheet a tap away. The bookmark on each card takes it off the list.
export default function WishlistScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const sheetRef = useRef<EventBottomSheetRef>(null);

  const { data: wishlist = [], isLoading } = useQuery({
    queryKey: ['savedEvents', user?.id],
    queryFn: () => getSavedEvents(user!.id),
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
  });

  const remove = useMutation({
    mutationFn: (eventId: string) => unsaveEvent(user!.id, eventId),
    onMutate: (eventId) => {
      queryClient.setQueryData<NearbyEvent[]>(
        ['savedEvents', user?.id],
        (events = []) => events.filter((e) => e.id !== eventId)
      );
      queryClient.setQueryData<string[]>(
        ['savedEventIds', user?.id],
        (ids = []) => ids.filter((i) => i !== eventId)
      );
    },
  });

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <IconButton
            icon="chevronDown"
            onPress={() => router.back()}
            accessibilityLabel="Close"
          />
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Wishlist</Text>
            <Text style={styles.headerSub}>
              {wishlist.length === 0
                ? 'Events you save land here'
                : `${wishlist.length} ${wishlist.length === 1 ? 'event' : 'events'} saved`}
            </Text>
          </View>
          {/* Balances the close button so the title stays centred. */}
          <View style={{ width: 40 }} />
        </View>

        {isLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 48 }} />
        ) : (
          <FlatList
            data={wishlist}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <Animated.View
                entering={FadeInDown.delay(Math.min(index, 6) * 50).duration(320)}
              >
                <WishlistCard
                  event={item}
                  onPress={() => sheetRef.current?.open(item.id)}
                  onRemove={() => remove.mutate(item.id)}
                />
              </Animated.View>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Icon name="bookmark" size={34} color={COLORS.primary} />
                </View>
                <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
                <Text style={styles.emptyText}>
                  Swipe right on events you like — or tap ♥ — and they'll be
                  waiting for you here.
                </Text>
                <Button
                  label="Swipe events"
                  height={44}
                  onPress={() => router.push('/events/swipe')}
                  style={{ marginTop: 6 }}
                />
              </View>
            }
          />
        )}
      </SafeAreaView>

      <EventBottomSheet ref={sheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  headerCenter: { alignItems: 'center' },
  headerTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 19,
    letterSpacing: -0.38,
    color: COLORS.textPrimary,
  },
  headerSub: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  list: { padding: 16, paddingTop: 8, gap: 14, flexGrow: 1 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 16,
    gap: 11,
    shadowColor: '#0F182C',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', gap: 13 },
  mediaTile: {
    width: 64,
    height: 64,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaEmoji: { fontSize: 30 },
  cardHeading: { flex: 1, minWidth: 0, gap: 5, justifyContent: 'center' },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.3,
    color: COLORS.textPrimary,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timeText: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  removeBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: {
    flexShrink: 1,
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    color: COLORS.textPrimary,
  },
  description: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginTop: -4,
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hostedBy: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    color: COLORS.textSecondary,
  },
  hostName: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    letterSpacing: -0.2,
    color: COLORS.textPrimary,
    marginTop: 1,
  },
  // Full-bleed rule, mockup-style.
  divider: {
    height: 1,
    backgroundColor: 'rgba(15,24,44,0.08)',
    marginHorizontal: -16,
  },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  attendeeStack: { flexDirection: 'row', alignItems: 'center' },
  attendeeRing: {
    borderRadius: 19,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  countText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: 'rgba(15,24,44,0.5)',
  },
  joinBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinText: { fontFamily: FONTS.bold, fontSize: 13.5, color: '#fff' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 60,
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
  },
});
