import { useRef } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSavedEvents, unsaveEvent } from '@/services/events.service';
import { useAuthStore } from '@/stores/authStore';
import EventSheetStack, {
  EventSheetStackRef,
} from '@/components/events/EventSheetStack';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatEventWhen } from '@/utils/time';
import { shortLocation } from '@/utils/location';
import { NearbyEvent, SavedEventItem } from '@/types/models';
import {
  Avatar,
  Button,
  Icon,
  Loader,
  PressableScale,
  Screen,
  ScreenHeader,
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
              {formatEventWhen(event.starts_at)}
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
  const sheetRef = useRef<EventSheetStackRef>(null);

  const { data: wishlist = [], isLoading } = useQuery({
    queryKey: queryKeys.savedEvents.of(user?.id),
    queryFn: () => getSavedEvents(user!.id),
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
  });

  const remove = useMutation({
    mutationFn: (eventId: string) => unsaveEvent(user!.id, eventId),
    onMutate: (eventId) => {
      queryClient.setQueryData<NearbyEvent[]>(
        queryKeys.savedEvents.of(user?.id),
        (events = []) => events.filter((e) => e.id !== eventId)
      );
      queryClient.setQueryData<string[]>(
        queryKeys.savedEventIds.of(user?.id),
        (ids = []) => ids.filter((i) => i !== eventId)
      );
    },
  });

  return (
    <Screen modal>
      <ScreenHeader
        title="Wishlist"
        subtitle={
          wishlist.length === 0
            ? 'Events you save land here'
            : `${wishlist.length} ${wishlist.length === 1 ? 'event' : 'events'} saved`
        }
        backIcon="chevronDown"
        tone="transparent"
      />

      {isLoading ? (
        <Loader />
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
                style={{ marginTop: SPACING[1.5] }}
              />
            </View>
          }
        />
      )}
      <EventSheetStack ref={sheetRef} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: SPACING[4], paddingTop: SPACING[2], gap: SPACING[3.5], flexGrow: 1 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS['2xl'],
    padding: SPACING[4],
    gap: SPACING[2.5],
    shadowColor: '#0F182C',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', gap: SPACING[3] },
  mediaTile: {
    width: 64,
    height: 64,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaEmoji: { fontSize: TYPE_SIZE.h1 },
  cardHeading: { flex: 1, minWidth: 0, gap: SPACING[1], justifyContent: 'center' },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.sectionLg,
    lineHeight: 23,
    letterSpacing: -0.3,
    color: COLORS.textPrimary,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1] },
  timeText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },
  removeBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  locationText: {
    flexShrink: 1,
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
  },
  description: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginTop: -4,
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  hostedBy: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textSecondary,
  },
  hostName: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    letterSpacing: -0.2,
    color: COLORS.textPrimary,
    marginTop: SPACING[0.5],
  },
  // Full-bleed rule, mockup-style.
  divider: {
    height: 1,
    backgroundColor: 'rgba(15,24,44,0.08)',
    marginHorizontal: -16,
  },
  footer: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  attendeeStack: { flexDirection: 'row', alignItems: 'center' },
  attendeeRing: {
    borderRadius: RADIUS.xl,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  countText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: 'rgba(15,24,44,0.5)',
  },
  joinBtn: {
    height: 40,
    paddingHorizontal: SPACING[4],
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinText: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.bodySm, color: '#fff' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2.5],
    paddingBottom: 60,
  },
  emptyIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[1.5],
  },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
  },
});
