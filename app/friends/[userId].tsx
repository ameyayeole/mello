import { useEffect, useRef, useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { DISCOVERY_FEED_KEYS, queryKeys } from '@/constants/queryKeys';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  FlatList,
  Alert,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useFriends } from '@/hooks/useFriends';
import {
  isBlocked,
  blockUser,
  unblockUser,
  reportUser,
  ReportReason,
} from '@/services/moderation.service';
import { getMyEvents } from '@/services/events.service';
import { splitByWhen } from '@/utils/events';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Profile } from '@/types/models';
import {
  Avatar,
  Button,
  CategoryPill,
  Glass,
  Icon,
  Loader,
  NavButton,
  PremiumBadge,
  PressableScale,
  VerifiedBadge,
} from '@/components/ui';
import EventSheetStack, {
  EventSheetStackRef,
} from '@/components/events/EventSheetStack';
import EventRow from '@/components/events/EventRow';
import { isPremium } from '@/utils/premium';
import { SafetyPopup, BlockConfirmDialog } from '@/components/safety';
import { showError } from '@/utils/errors';

// ── Frosted-sheet scaffold ───────────────────────────────────────────────────
// These five constants and the three animated styles below are mirrored from
// the own-profile tab (app/(tabs)/profile.tsx). It is a deliberate, temporary
// duplication, NOT a fork left to rot: the scaffold — photo window, parallax,
// Ken Burns, self-frosting pane — is subtle enough that two copies will drift,
// so it is queued to be lifted into a shared <ProfileHeroSheet> in one pass.
// That extraction was held back only because the own-profile file is mid-edit
// (the settings overlay hand-off); doing it now risked clobbering that work.
// See DESIGN.md §3 "The full-bleed sheet" for what every number means.
const HERO_RATIO = 1.25;
const SHEET_RADIUS = 32;
const PARALLAX = 0.5;
const PHOTO_BLEED = 250;
const KEN_BURNS_SCALE = 1.07;
const KEN_BURNS_MS = 24000;
const SHEET_UNDERHANG = 500;

// One metric box, shared shape with the own-profile screen's Stat. Local — it
// is four uses on one screen, and a premature primitive is as bad as a fork.
function Stat({
  value,
  label,
  accent = false,
}: {
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { sendRequest, accept, remove, relationshipWith } = useFriends();
  const rel = relationshipWith(userId);
  const { width, height } = useWindowDimensions();

  const isSelf = me?.id === userId;

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const sheetRef = useRef<EventSheetStackRef>(null);

  // Safety popup #12: intro sheet shown every time before the report reasons.
  const [reportIntroVisible, setReportIntroVisible] = useState(false);
  // Safety popup #13: block confirmation dialog (every time).
  const [blockConfirmVisible, setBlockConfirmVisible] = useState(false);

  // ── Scaffold animation (all hooks, so they run before any early return) ──
  const photoHeight = width * HERO_RATIO;
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const photoStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    if (y < 0) return { transform: [{ scale: 1 - y / photoHeight }] };
    return { transform: [{ translateY: y * PARALLAX }] };
  });
  const ken = useSharedValue(1);
  useEffect(() => {
    ken.value = withRepeat(
      withTiming(KEN_BURNS_SCALE, {
        duration: KEN_BURNS_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [ken]);
  const kenStyle = useAnimatedStyle(() => ({ transform: [{ scale: ken.value }] }));
  const frostStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scrollY.value - photoHeight + SHEET_RADIUS }],
  }));

  const { data: profile, isLoading } = useQuery({
    queryKey: queryKeys.profile.of(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });

  // Note: there is no give-thumbs control here. Thumbs are a post-event action
  // — you rate the people you actually met, from the wrap flow (RateCard) — so
  // the profile only ever *displays* the count, never awards it.

  // Whether the current user has blocked this profile.
  const { data: blocked } = useQuery({
    queryKey: queryKeys.blocked.of(me?.id, userId),
    queryFn: () => isBlocked(me!.id, userId),
    enabled: !!me && !isSelf,
  });

  // Their public events, split to the upcoming ones — someone else's hosted
  // events are public, their participations are not, so this is "what they're
  // throwing that you could join". Degrades to nothing if RLS hides them.
  const { data: theirEvents } = useQuery({
    queryKey: queryKeys.myEvents.of(userId),
    queryFn: () => getMyEvents(userId),
    enabled: !!userId && !isSelf,
    select: (rows) => splitByWhen(rows).upcoming,
  });

  const block = useMutation({
    mutationFn: () => blockUser(me!.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.blocked.of(me?.id, userId) });
      // Blocking severs the friendship; refresh the friends list + counts.
      qc.invalidateQueries({ queryKey: queryKeys.friendships.of(me?.id) });
      qc.invalidateQueries({ queryKey: queryKeys.profile.of(userId) });
      // Drop their events from every discovery feed, not just the map.
      for (const queryKey of DISCOVERY_FEED_KEYS) {
        qc.invalidateQueries({ queryKey });
      }
    },
    onError: (e) => showError(e),
  });

  const unblock = useMutation({
    mutationFn: () => unblockUser(me!.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.blocked.of(me?.id, userId) });
      for (const queryKey of DISCOVERY_FEED_KEYS) {
        qc.invalidateQueries({ queryKey });
      }
    },
    onError: (e) => showError(e),
  });

  const report = useMutation({
    mutationFn: (reason: ReportReason) => reportUser(me!.id, userId, reason),
    onSuccess: () =>
      Alert.alert('Report sent', 'Thanks — our team will review this.'),
    onError: (e) => showError(e),
  });

  function handleAddFriend() {
    sendRequest.mutate(userId, {
      onSuccess: () => Alert.alert('Sent!', 'Friend request sent.'),
      onError: (e) => showError(e),
    });
  }

  function confirmBlock() {
    setBlockConfirmVisible(true);
  }

  function openReport() {
    setReportIntroVisible(true);
  }

  function showReportReasons() {
    Alert.alert(
      `Report ${profile?.name ?? 'user'}`,
      'Why are you reporting them?',
      [
        { text: 'Spam', onPress: () => report.mutate('spam') },
        { text: 'Harassment', onPress: () => report.mutate('harassment') },
        {
          text: 'Inappropriate content',
          onPress: () => report.mutate('inappropriate'),
        },
        { text: 'Fake profile', onPress: () => report.mutate('fake_profile') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  function openMenu() {
    Alert.alert(profile?.name ?? 'Options', undefined, [
      blocked
        ? { text: 'Unblock', onPress: () => unblock.mutate() }
        : { text: 'Block', style: 'destructive', onPress: confirmBlock },
      { text: 'Report', onPress: openReport },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function handleUnfriend() {
    if (!rel.friendshipId) return;
    Alert.alert(
      'Remove friend',
      `Remove ${profile?.name ?? 'this person'} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfriend',
          style: 'destructive',
          onPress: () =>
            remove.mutate(rel.friendshipId!, { onError: (e) => showError(e) }),
        },
      ]
    );
  }

  if (isLoading || !profile) {
    return (
      <View style={[styles.container, styles.loading]}>
        <StatusBar style="light" />
        <Loader />
      </View>
    );
  }

  const gallery = profile.photos?.length
    ? profile.photos
    : profile.photo_url
      ? [profile.photo_url]
      : [];
  const mainPhoto = gallery[0] ?? null;

  const metaBits = [
    profile.username ? `@${profile.username}` : null,
    profile.age != null ? String(profile.age) : null,
    profile.city ?? null,
  ].filter(Boolean);

  function openViewer(index: number) {
    if (gallery.length === 0) return;
    setViewerIndex(index);
    setViewerOpen(true);
  }

  // The friend action row: one coral primary for the state's main move, with a
  // neutral on-dark square for the secondary where there is one. On the dark
  // sheet the black `secondary` button vanishes, so nothing uses it here.
  function friendActions() {
    if (isSelf || blocked) return null;
    switch (rel.status) {
      case 'friends':
        return (
          <View style={styles.actionRow}>
            <Button
              label="Message"
              variant="primary"
              size="md"
              icon="chat"
              style={styles.actionPrimary}
              onPress={() => router.push(`/(tabs)/chats/dm/${userId}`)}
            />
            <PressableScale
              scaleTo={0.92}
              style={styles.actionSquare}
              onPress={handleUnfriend}
              disabled={remove.isPending}
              accessibilityRole="button"
              accessibilityLabel="Remove friend"
            >
              <Icon name="check" size={20} color={COLORS.white} />
            </PressableScale>
          </View>
        );
      case 'request_sent':
        return (
          <Button
            label="Requested · tap to withdraw"
            variant="tertiary"
            size="md"
            fullWidth
            disabled={remove.isPending}
            onPress={() =>
              remove.mutate(rel.friendshipId!, { onError: (e) => showError(e) })
            }
          />
        );
      case 'request_received':
        return (
          <View style={styles.actionRow}>
            <Button
              label="Accept request"
              variant="primary"
              size="md"
              style={styles.actionPrimary}
              disabled={accept.isPending}
              onPress={() => accept.mutate(rel.friendshipId!)}
            />
            <PressableScale
              scaleTo={0.92}
              style={styles.actionSquare}
              disabled={remove.isPending}
              onPress={() =>
                remove.mutate(rel.friendshipId!, { onError: (e) => showError(e) })
              }
              accessibilityRole="button"
              accessibilityLabel="Decline request"
            >
              <Icon name="close" size={20} color={COLORS.white} />
            </PressableScale>
          </View>
        );
      default:
        return (
          <Button
            label="Add friend"
            variant="primary"
            size="md"
            icon="userPlus"
            fullWidth
            onPress={handleAddFriend}
          />
        );
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* Photo window — clips the parallaxing photo to the sheet's top edge,
            so the corners show photo and the self-frosting pane has a uniform
            backdrop. See app/(tabs)/profile.tsx for the full rationale. */}
        <Pressable
          style={[styles.photoWindow, { height: photoHeight + PHOTO_BLEED }]}
          onPress={() => openViewer(0)}
          accessibilityRole="button"
          accessibilityLabel="View photos"
        >
          <Animated.View
            style={[styles.photoInner, { height: photoHeight }, photoStyle]}
          >
            {mainPhoto ? (
              <Animated.View style={[StyleSheet.absoluteFill, kenStyle]}>
                <Image
                  source={{ uri: mainPhoto }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={200}
                />
              </Animated.View>
            ) : (
              <View style={styles.photoFallback}>
                <Avatar name={profile.name} size={96} />
              </View>
            )}
            <Svg style={styles.photoTopFade}>
              <Defs>
                <LinearGradient id="friendTopFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={COLORS.ink} stopOpacity={0.5} />
                  <Stop offset="1" stopColor={COLORS.ink} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#friendTopFade)" />
            </Svg>
          </Animated.View>
        </Pressable>

        <Glass
          tier="onPhoto"
          radius={SHEET_RADIUS}
          edge="top"
          backdrop={
            mainPhoto ? (
              <Animated.View
                style={[styles.frost, { height }, frostStyle]}
                pointerEvents="none"
              >
                <Image
                  source={{ uri: mainPhoto }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  blurRadius={60}
                />
                <View style={styles.frostVeil} />
              </Animated.View>
            ) : undefined
          }
          style={[
            styles.sheet,
            {
              minHeight: height - photoHeight + SHEET_RADIUS + SHEET_UNDERHANG,
              paddingBottom:
                insets.bottom + SPACING[8] + SHEET_UNDERHANG,
              marginBottom: -SHEET_UNDERHANG,
            },
          ]}
        >
          <View style={styles.grabber} />

          <Animated.View entering={FadeInDown.duration(400)}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {profile.name}
              </Text>
              {profile.kyc_status === 'approved' && <VerifiedBadge size={20} />}
              {isPremium(profile) && <PremiumBadge size={20} />}
            </View>
            {metaBits.length > 0 && (
              <Text style={styles.handle}>{metaBits.join(' · ')}</Text>
            )}
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          </Animated.View>

          {/* The one coral CTA on the screen is whichever friend action is
              live. `friendActions` is null for yourself and blocked users. */}
          {!isSelf && !blocked && (
            <Animated.View
              entering={FadeInDown.delay(60).duration(400)}
              style={styles.actions}
            >
              {friendActions()}
            </Animated.View>
          )}

          <Animated.View
            entering={FadeInDown.delay(90).duration(400)}
            style={styles.stats}
          >
            <Stat value={profile.events_hosted} label="Hosted" />
            <Stat value={profile.events_attended ?? 0} label="Attended" />
            <Stat value={profile.friends_count} label="Friends" />
            <Stat value={profile.thumbs_count ?? 0} label="Thumbs" accent />
          </Animated.View>

          {(profile.interests?.length ?? 0) > 0 && (
            <Animated.View
              entering={FadeInDown.delay(120).duration(400)}
              style={styles.pills}
            >
              {profile.interests.map((id) => {
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
            </Animated.View>
          )}

          {gallery.length > 1 && (
            <Animated.View entering={FadeInDown.delay(150).duration(400)}>
              <Text style={styles.sectionTitle}>Photos</Text>
              <Animated.ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.bleed}
                contentContainerStyle={styles.photoRow}
              >
                {gallery.map((uri, i) => (
                  <PressableScale
                    key={`${uri}-${i}`}
                    scaleTo={0.96}
                    style={styles.photoTile}
                    onPress={() => openViewer(i)}
                    accessibilityRole="button"
                    accessibilityLabel={`Photo ${i + 1}`}
                  >
                    <Image
                      source={{ uri }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={150}
                    />
                  </PressableScale>
                ))}
              </Animated.ScrollView>
            </Animated.View>
          )}

          {/* Their upcoming public events — something you could actually join. */}
          {(theirEvents?.length ?? 0) > 0 && (
            <Animated.View entering={FadeInDown.delay(180).duration(400)}>
              <Text style={styles.sectionTitle}>Hosting</Text>
              <View style={{ gap: SPACING[2.5] }}>
                {theirEvents!.map((e) => (
                  <EventRow
                    key={e.id}
                    event={e}
                    onDark
                    onPress={() => sheetRef.current?.open(e.id)}
                  />
                ))}
              </View>
            </Animated.View>
          )}

          {!isSelf && blocked && (
            <View style={styles.blockedBanner}>
              <Text style={styles.blockedText}>You blocked this user.</Text>
              <Button
                label={unblock.isPending ? 'Unblocking…' : 'Unblock'}
                variant="tertiary"
                size="md"
                onPress={() => unblock.mutate()}
                disabled={unblock.isPending}
              />
            </View>
          )}
        </Glass>
      </Animated.ScrollView>

      {/* Top bar: back (left), whose profile (centre), overflow menu (right). */}
      <View
        style={[styles.topBar, { top: insets.top + SPACING[1] }]}
        pointerEvents="box-none"
      >
        <Glass tier="onPhoto" radius={20} style={styles.topGlyph}>
          <NavButton
            icon="back"
            color={COLORS.white}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          />
        </Glass>
        <Text style={styles.topHandle} numberOfLines={1}>
          {profile.username ? `@${profile.username}` : profile.name}
        </Text>
        {!isSelf ? (
          <PressableScale
            scaleTo={0.9}
            onPress={openMenu}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <Glass tier="onPhoto" radius={20} style={styles.topGlyph}>
              <Icon name="dots" size={18} color={COLORS.white} />
            </Glass>
          </PressableScale>
        ) : (
          // Keeps the handle centred when there's no menu.
          <View style={styles.topGlyph} />
        )}
      </View>

      {/* Fullscreen photo viewer — dims the profile and opens over it. */}
      <Modal
        visible={viewerOpen}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setViewerOpen(false)}
      >
        <View style={styles.viewer}>
          <FlatList
            data={gallery}
            horizontal
            pagingEnabled
            initialScrollIndex={viewerIndex}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(uri, i) => `${uri}-${i}`}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            onMomentumScrollEnd={(e) =>
              setViewerIndex(Math.round(e.nativeEvent.contentOffset.x / width))
            }
            renderItem={({ item }) => (
              <Pressable
                style={[styles.viewerPage, { width }]}
                onPress={() => setViewerOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close photos"
              >
                <Image
                  source={{ uri: item }}
                  style={styles.viewerImage}
                  contentFit="contain"
                  transition={150}
                />
              </Pressable>
            )}
          />
          <View
            style={[styles.viewerTop, { paddingTop: insets.top + SPACING[2] }]}
            pointerEvents="box-none"
          >
            <Text style={styles.viewerCounter}>
              {viewerIndex + 1} / {gallery.length}
            </Text>
            <NavButton
              icon="close"
              color={COLORS.white}
              onPress={() => setViewerOpen(false)}
              accessibilityLabel="Close photos"
            />
          </View>
          {gallery.length > 1 && (
            <View
              style={[styles.viewerDots, { bottom: insets.bottom + SPACING[6] }]}
              pointerEvents="none"
            >
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
          )}
        </View>
      </Modal>

      {/* Safety popup #12: before-you-report sheet (every time). */}
      <SafetyPopup
        visible={reportIntroVisible}
        icon="flag"
        accent={COLORS.error}
        tint="#FDEAEA"
        title="Tell us what happened"
        body={
          "Reports are confidential and reviewed by our team. If you're in " +
          'immediate danger, call 112 first. Add as much detail as you can — ' +
          'it helps us act faster.'
        }
        primaryLabel="Continue report"
        onPrimary={() => {
          setReportIntroVisible(false);
          showReportReasons();
        }}
        secondaryLabel="Call 112"
        onSecondary={() => Linking.openURL('tel:112')}
        onClose={() => setReportIntroVisible(false)}
      />

      {/* Safety popup #13: block confirmation (every time). */}
      <BlockConfirmDialog
        visible={blockConfirmVisible}
        name={profile?.name?.split(' ')[0]}
        onConfirm={() => {
          setBlockConfirmVisible(false);
          block.mutate();
        }}
        onCancel={() => setBlockConfirmVisible(false)}
      />

      <EventSheetStack ref={sheetRef} />
    </View>
  );
}

const FILL = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.accent },
  loading: { alignItems: 'center', justifyContent: 'center' },

  frost: { position: 'absolute', top: 0, left: 0, right: 0 },
  frostVeil: { ...FILL, backgroundColor: COLORS.inkVeil },

  photoWindow: { marginTop: -PHOTO_BLEED, overflow: 'hidden' },
  photoInner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    transformOrigin: 'bottom',
  },
  photoFallback: {
    ...FILL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTopFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 },

  sheet: {
    marginTop: -SHEET_RADIUS,
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[4],
  },
  grabber: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.textOnDarkMuted,
    alignSelf: 'center',
    marginBottom: SPACING[4],
  },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },
  name: {
    flexShrink: 1,
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.display,
    lineHeight: 36,
    letterSpacing: -1,
    color: COLORS.white,
  },
  handle: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textOnDark,
    marginTop: SPACING[0.5],
  },
  bio: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    lineHeight: 20,
    color: COLORS.textOnDark,
    marginTop: SPACING[3.5],
  },

  actions: { marginTop: SPACING[5] },
  actionRow: { flexDirection: 'row', gap: SPACING[2.5] },
  actionPrimary: { flex: 1 },
  actionSquare: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.fillOnDark,
    borderWidth: 1,
    borderColor: COLORS.borderOnDark,
    alignItems: 'center',
    justifyContent: 'center',
  },

  stats: { flexDirection: 'row', gap: SPACING[2], marginTop: SPACING[5] },
  statBox: {
    flex: 1,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING[3],
    alignItems: 'center',
    backgroundColor: COLORS.fillOnDark,
    borderWidth: 1,
    borderColor: COLORS.borderOnDark,
  },
  statValue: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.titleLg,
    lineHeight: 26,
    color: COLORS.white,
  },
  statValueAccent: { color: COLORS.primaryLight },
  statLabel: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textOnDarkMuted,
    marginTop: SPACING[1],
  },

  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING[2],
    marginTop: SPACING[5],
  },

  sectionTitle: {
    fontFamily: FONTS.headingBold,
    fontSize: TYPE_SIZE.sectionLg,
    letterSpacing: -0.3,
    color: COLORS.white,
    marginTop: SPACING[6],
    marginBottom: SPACING[3.5],
  },
  bleed: { marginHorizontal: -SPACING[5] },
  photoRow: { gap: SPACING[2.5], paddingHorizontal: SPACING[5] },
  photoTile: {
    width: 132,
    height: 168,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderOnDark,
    backgroundColor: COLORS.fillOnDark,
  },

  blockedBanner: {
    alignItems: 'center',
    gap: SPACING[2.5],
    marginTop: SPACING[6],
  },
  blockedText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textOnDarkMuted,
  },

  topBar: {
    position: 'absolute',
    left: SPACING[5],
    right: SPACING[5],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[3],
  },
  topGlyph: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHandle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.white,
  },

  viewer: { flex: 1, backgroundColor: COLORS.lightbox },
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
  },
  viewerCounter: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.white,
  },
  viewerDots: {
    position: 'absolute',
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
    backgroundColor: COLORS.borderOnDark,
  },
  viewerDotActive: { backgroundColor: COLORS.white },
});
