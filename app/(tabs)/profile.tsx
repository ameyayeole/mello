import { useRef, useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import {
  getSavedEvents,
  unsaveEvent,
  getJoinedEvents,
} from '@/services/events.service';
import EventBottomSheet, {
  EventBottomSheetRef,
} from '@/components/events/EventBottomSheet';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { formatEventTime } from '@/utils/time';
import { isPremium, PREMIUM_GOLD, PREMIUM_GOLD_TINT } from '@/utils/premium';
import { NearbyEvent } from '@/types/models';
import {
  Avatar,
  CategoryPill,
  Icon,
  IconButton,
  NavButton,
  PremiumBadge,
  PressableScale,
  SectionLabel,
  VerifiedBadge,
} from '@/components/ui';
import EventRow from '@/components/events/EventRow';

export default function ProfileTabScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { width } = useWindowDimensions();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [tab, setTab] = useState<'upcoming' | 'attended'>('upcoming');
  const queryClient = useQueryClient();
  const sheetRef = useRef<EventBottomSheetRef>(null);

  // Wishlist: events saved from the swipe deck's bookmark button.
  const { data: wishlist = [] } = useQuery({
    queryKey: queryKeys.savedEvents.of(user?.id),
    queryFn: () => getSavedEvents(user!.id),
    enabled: !!user,
    staleTime: 60_000,
    retry: 1,
  });

  const { data: joined = [] } = useQuery({
    queryKey: queryKeys.joinedEvents.of(user?.id),
    queryFn: () => getJoinedEvents(user!.id),
    enabled: !!user,
  });

  const removeSaved = useMutation({
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

  if (!user) return null;

  // The main photo is the gallery's first entry; fall back to photo_url for
  // profiles created before the gallery existed.
  const gallery = user.photos?.length
    ? user.photos
    : user.photo_url
      ? [user.photo_url]
      : [];
  const mainPhoto = gallery[0] ?? null;

  const metaBits = [
    user.username ? `@${user.username}` : null,
    user.age != null ? String(user.age) : null,
    user.city ?? null,
  ].filter(Boolean);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {/* Dark header with the hero photo nested inside */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <View>
          <View style={styles.headerBar}>
            <Text style={styles.headerTitle}>Profile</Text>
            <View style={styles.headerActions}>
              <IconButton
                icon="share"
                size={38}
                iconSize={18}
                color="#fff"
                style={styles.headerBtn}
                onPress={() => router.push('/profile/settings')}
                accessibilityLabel="Share profile"
              />
              <IconButton
                icon="settings"
                size={38}
                iconSize={18}
                color="#fff"
                style={styles.headerBtn}
                onPress={() => router.push('/profile/settings')}
                accessibilityLabel="Settings"
              />
            </View>
          </View>

          <Animated.View entering={FadeInDown.duration(400)}>
            <PressableScale
              scaleTo={0.99}
              style={styles.hero}
              onPress={() => {
                if (gallery.length > 0) {
                  setViewerIndex(0);
                  setViewerOpen(true);
                } else {
                  router.push('/profile/edit');
                }
              }}
            >
              {mainPhoto ? (
                <Image
                  source={{ uri: mainPhoto }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={styles.heroFallback}>
                  <Avatar name={user.name} size={96} />
                  <Text style={styles.heroFallbackHint}>
                    Tap to add your photo
                  </Text>
                </View>
              )}
              <Svg style={styles.heroGradient} pointerEvents="none">
                <Defs>
                  <LinearGradient id="meFade" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={COLORS.accent} stopOpacity={0} />
                    <Stop offset="1" stopColor={COLORS.accent} stopOpacity={0.8} />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#meFade)" />
              </Svg>
              <View style={styles.heroInfo}>
                <View style={styles.heroNameRow}>
                  <Text style={styles.heroName}>{user.name}</Text>
                  {user.kyc_status === 'approved' && (
                    <VerifiedBadge size={18} />
                  )}
                  {isPremium(user) && <PremiumBadge size={18} />}
                </View>
                {metaBits.length > 0 && (
                  <Text style={styles.heroMeta}>{metaBits.join(' · ')}</Text>
                )}
              </View>
              {gallery.length > 1 && (
                <View style={styles.photoCountPill}>
                  <Icon name="image" size={12} color="#fff" />
                  <Text style={styles.photoCountText}>{gallery.length}</Text>
                </View>
              )}
              <PressableScale
                scaleTo={0.9}
                style={styles.editBadge}
                onPress={() => router.push('/profile/edit')}
              >
                <Icon name="edit" size={15} color={COLORS.textPrimary} />
              </PressableScale>
            </PressableScale>
          </Animated.View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats */}
        <Animated.View
          entering={FadeInDown.delay(70).duration(400)}
          style={styles.stats}
        >
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{user.events_hosted}</Text>
            <Text style={styles.statLabel}>Hosted</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{user.events_attended ?? 0}</Text>
            <Text style={styles.statLabel}>Attended</Text>
          </View>
          <PressableScale
            style={styles.statCard}
            scaleTo={0.94}
            onPress={() => router.push('/friends')}
          >
            <Text style={styles.statValue}>{user.friends_count}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </PressableScale>
          <View style={[styles.statCard, styles.statCardAccent]}>
            <Text style={[styles.statValue, styles.statValueAccent]}>
              {user.thumbs_count ?? 0}
            </Text>
            <Text style={[styles.statLabel, styles.statLabelAccent]}>
              Thumbs
            </Text>
          </View>
        </Animated.View>

        {/* Mello+ status / upsell */}
        <Animated.View entering={FadeInDown.delay(90).duration(400)}>
          <PressableScale
            scaleTo={0.98}
            style={styles.premiumCard}
            onPress={() => router.push('/premium')}
            accessibilityRole="button"
            accessibilityLabel="Mello+"
          >
            <View style={styles.premiumCardIcon}>
              <Icon name="crown" size={19} color={PREMIUM_GOLD} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.premiumCardTitle}>
                {isPremium(user) ? 'Mello+ active' : 'Get Mello+'}
              </Text>
              <Text style={styles.premiumCardSub}>
                {isPremium(user)
                  ? user.premium_until
                    ? `Until ${new Date(user.premium_until).toLocaleDateString()}`
                    : 'All premium perks unlocked'
                  : 'Whole-city events, filters & unlimited swipes'}
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={PREMIUM_GOLD} />
          </PressableScale>
        </Animated.View>

        {/* Bio prompt card */}
        {user.bio ? (
          <Animated.View
            entering={FadeInDown.delay(110).duration(400)}
            style={styles.promptCard}
          >
            <Text style={styles.promptText}>{user.bio}</Text>
          </Animated.View>
        ) : null}

        {/* Interests */}
        {user.interests.length > 0 && (
          <Animated.View entering={FadeInDown.delay(150).duration(400)}>
            <Text style={styles.interestsLabel}>Interests</Text>
            <View style={styles.pills}>
              {user.interests.map((id) => {
                const a = ACTIVITY_MAP[id];
                if (!a) return null;
                return (
                  <CategoryPill
                    key={id}
                    emoji={a.emoji}
                    label={a.label}
                    color={categoryStyle(id).accent}
                  />
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* Upcoming / Attended tabs */}
        <Animated.View entering={FadeInDown.delay(180).duration(400)}>
          <View style={styles.tabs}>
            <PressableScale scaleTo={0.96} onPress={() => setTab('upcoming')}>
              <Text
                style={[styles.tab, tab === 'upcoming' && styles.tabActive]}
              >
                Upcoming
              </Text>
              {tab === 'upcoming' && <View style={styles.tabBar} />}
            </PressableScale>
            <PressableScale scaleTo={0.96} onPress={() => setTab('attended')}>
              <Text
                style={[styles.tab, tab === 'attended' && styles.tabActive]}
              >
                Attended
              </Text>
              {tab === 'attended' && <View style={styles.tabBar} />}
            </PressableScale>
          </View>

          {tab === 'upcoming' ? (
            joined.length > 0 ? (
              <View style={{ gap: SPACING[2.5] }}>
                {joined.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    onPress={() => sheetRef.current?.open(e.id)}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.tabEmpty}>No upcoming plans yet.</Text>
            )
          ) : (
            <Text style={styles.tabEmpty}>
              Events you've been to will show up here.
            </Text>
          )}
        </Animated.View>

        {/* Wishlist: events bookmarked on the swipe deck */}
        {wishlist.length > 0 && (
          <Animated.View entering={FadeInDown.delay(210).duration(400)}>
            <SectionLabel style={styles.sectionLabel}>Wishlist</SectionLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.wishlistRow}
            >
              {wishlist.map((e) => {
                const cat = categoryStyle(e.activity);
                const emoji = ACTIVITY_MAP[e.activity]?.emoji ?? '📍';
                return (
                  <PressableScale
                    key={e.id}
                    scaleTo={0.96}
                    style={styles.wishCard}
                    onPress={() => sheetRef.current?.open(e.id)}
                  >
                    <View
                      style={[styles.wishMedia, { backgroundColor: cat.tint }]}
                    >
                      {e.image_url ? (
                        <Image
                          source={{ uri: e.image_url }}
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                          transition={150}
                        />
                      ) : (
                        <Text style={styles.wishEmoji}>{emoji}</Text>
                      )}
                      <PressableScale
                        scaleTo={0.85}
                        style={styles.wishRemove}
                        onPress={() => removeSaved.mutate(e.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${e.title} from wishlist`}
                      >
                        <Icon name="close" size={12} color="#fff" strokeWidth={2.6} />
                      </PressableScale>
                    </View>
                    <View style={styles.wishBody}>
                      <Text style={styles.wishTitle} numberOfLines={2}>
                        {e.title}
                      </Text>
                      <Text style={styles.wishTime} numberOfLines={1}>
                        {formatEventTime(e.starts_at)}
                      </Text>
                    </View>
                  </PressableScale>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}
      </ScrollView>

      {/* Fullscreen photo viewer: swipe through the whole gallery */}
      <Modal
        visible={viewerOpen}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setViewerOpen(false)}
      >
        <View style={styles.viewer}>
          <FlatList
            data={gallery}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(uri, i) => `${uri}-${i}`}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            onMomentumScrollEnd={(e) =>
              setViewerIndex(
                Math.round(e.nativeEvent.contentOffset.x / width)
              )
            }
            renderItem={({ item }) => (
              <View style={[styles.viewerPage, { width }]}>
                <Image
                  source={{ uri: item }}
                  style={styles.viewerImage}
                  contentFit="contain"
                  transition={150}
                />
              </View>
            )}
          />
          <SafeAreaView style={styles.viewerTop} pointerEvents="box-none">
            <Text style={styles.viewerCounter}>
              {viewerIndex + 1} / {gallery.length}
            </Text>
            <NavButton
              icon="close"
              color={COLORS.white}
              onPress={() => setViewerOpen(false)}
              accessibilityLabel="Close photos"
            />
          </SafeAreaView>
          <View style={styles.viewerDots} pointerEvents="none">
            {gallery.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.viewerDot,
                  i === viewerIndex && styles.viewerDotActive,
                ]}
              />
            ))}
          </View>
        </View>
      </Modal>

      <EventBottomSheet ref={sheetRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.accent,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    paddingBottom: SPACING[4],
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[3],
  },
  headerTitle: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.title,
    letterSpacing: -0.4,
    color: '#fff',
  },
  headerActions: { flexDirection: 'row', gap: SPACING[2.5] },
  headerBtn: { backgroundColor: 'rgba(255,255,255,0.12)' },
  scroll: { padding: SPACING[4], gap: SPACING[3], paddingBottom: 90 },
  hero: {
    height: 250,
    marginHorizontal: SPACING[4],
    marginTop: SPACING[3.5],
    borderRadius: RADIUS['2xl'],
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heroFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2.5],
    backgroundColor: COLORS.primaryTint,
  },
  heroFallbackHint: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.primary,
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 130,
  },
  heroInfo: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING[4],
  },
  heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  heroName: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.titleLg,
    letterSpacing: -0.4,
    color: '#fff',
  },
  heroMeta: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: 'rgba(255,255,255,0.85)',
    marginTop: SPACING[1],
  },
  editBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: RADIUS.xl,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCountPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    height: 26,
    paddingHorizontal: SPACING[2.5],
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(23,21,26,0.5)',
  },
  photoCountText: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.micro, color: '#fff' },
  stats: { flexDirection: 'row', gap: SPACING[2] },
  statCard: {
    flex: 1,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING[3],
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  statCardAccent: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  statValue: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.title,
    color: COLORS.textPrimary,
  },
  statValueAccent: { color: '#fff' },
  statLabel: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.nano,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  statLabelAccent: { color: 'rgba(255,255,255,0.85)' },
  premiumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(201,147,10,0.35)',
    padding: SPACING[3],
  },
  premiumCardIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: PREMIUM_GOLD_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumCardTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  premiumCardSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  promptCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: RADIUS.lg,
    padding: SPACING[3.5],
  },
  promptText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 20,
    color: COLORS.textPrimary,
  },
  interestsLabel: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginBottom: SPACING[2.5],
    marginLeft: SPACING[0.5],
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[2] },
  tabs: {
    flexDirection: 'row',
    gap: SPACING[5],
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: SPACING[3.5],
  },
  tab: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textMuted,
    paddingBottom: SPACING[2.5],
  },
  tabActive: { fontFamily: FONTS.heading, color: COLORS.textPrimary },
  tabBar: {
    height: 2.5,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
    marginTop: -2.5,
  },
  tabEmpty: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
    paddingVertical: SPACING[2.5],
  },
  sectionLabel: { marginTop: SPACING[1.5], marginBottom: SPACING[2.5], marginLeft: SPACING[1] },
  viewer: { flex: 1, backgroundColor: COLORS.accent },
  viewerPage: { flex: 1, justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[2],
  },
  viewerCounter: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.bodyMd, color: '#fff' },
  viewerDots: {
    position: 'absolute',
    bottom: 46,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING[1.5],
  },
  viewerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  viewerDotActive: { backgroundColor: '#fff' },
  wishlistRow: { gap: SPACING[2.5], paddingRight: SPACING[1] },
  wishCard: {
    width: 148,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },
  wishMedia: { height: 86, alignItems: 'center', justifyContent: 'center' },
  wishEmoji: { fontSize: TYPE_SIZE.display },
  wishRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: RADIUS.xs,
    backgroundColor: 'rgba(23,21,26,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishBody: { padding: SPACING[2.5], paddingTop: SPACING[2], gap: SPACING[0.5] },
  wishTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 17,
    color: COLORS.textPrimary,
  },
  wishTime: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textSecondary,
  },
});
