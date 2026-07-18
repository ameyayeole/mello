import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useFriends } from '@/hooks/useFriends';
import { hasThumbed, giveThumb, removeThumb } from '@/services/thumbs.service';
import {
  isBlocked,
  blockUser,
  unblockUser,
  reportUser,
  ReportReason,
} from '@/services/moderation.service';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Profile } from '@/types/models';
import {
  Avatar,
  Button,
  Icon,
  IconButton,
  IconName,
  PremiumBadge,
  PressableScale,
  SectionLabel,
  VerifiedBadge,
} from '@/components/ui';
import { isPremium } from '@/utils/premium';
import { SafetyPopup, BlockConfirmDialog } from '@/components/safety';

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { sendRequest, accept, remove, relationshipWith } = useFriends();
  const rel = relationshipWith(userId);

  const isSelf = me?.id === userId;

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', userId],
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

  // Whether the current user has already given this profile a thumbs.
  const { data: thumbed } = useQuery({
    queryKey: ['thumbed', me?.id, userId],
    queryFn: () => hasThumbed(me!.id, userId),
    enabled: !!me && !isSelf,
  });

  const toggleThumb = useMutation({
    mutationFn: () =>
      thumbed ? removeThumb(me!.id, userId) : giveThumb(me!.id, userId),
    // Refresh the viewed profile (its thumbs_count changed) and the thumbed flag.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile', userId] });
      qc.invalidateQueries({ queryKey: ['thumbed', me?.id, userId] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  // Whether the current user has blocked this profile.
  const { data: blocked } = useQuery({
    queryKey: ['blocked', me?.id, userId],
    queryFn: () => isBlocked(me!.id, userId),
    enabled: !!me && !isSelf,
  });

  const block = useMutation({
    mutationFn: () => blockUser(me!.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blocked', me?.id, userId] });
      // Blocking severs the friendship; refresh the friends list + counts.
      qc.invalidateQueries({ queryKey: ['friendships', me?.id] });
      qc.invalidateQueries({ queryKey: ['profile', userId] });
      // Drop the blocked host's events from the map + Explore feed.
      qc.invalidateQueries({ queryKey: ['events', 'nearby'] });
      qc.invalidateQueries({ queryKey: ['exploreFeed'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const unblock = useMutation({
    mutationFn: () => unblockUser(me!.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blocked', me?.id, userId] });
      qc.invalidateQueries({ queryKey: ['events', 'nearby'] });
      qc.invalidateQueries({ queryKey: ['exploreFeed'] });
    },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const report = useMutation({
    mutationFn: (reason: ReportReason) => reportUser(me!.id, userId, reason),
    onSuccess: () =>
      Alert.alert('Report sent', 'Thanks — our team will review this.'),
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  function handleAddFriend() {
    sendRequest.mutate(userId, {
      onSuccess: () => Alert.alert('Sent!', 'Friend request sent.'),
      onError: (e: any) => Alert.alert('Error', e.message),
    });
  }

  // Safety popup #12: intro sheet shown every time before the report reasons.
  const [reportIntroVisible, setReportIntroVisible] = useState(false);
  // Safety popup #13: block confirmation dialog (every time).
  const [blockConfirmVisible, setBlockConfirmVisible] = useState(false);

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
            remove.mutate(rel.friendshipId!, {
              onError: (e: any) => Alert.alert('Error', e.message),
            }),
        },
      ]
    );
  }

  if (isLoading || !profile) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  const gallery = profile.photos?.length
    ? profile.photos
    : profile.photo_url
      ? [profile.photo_url]
      : [];
  const mainPhoto = gallery[0] ?? null;
  const firstName = profile.name?.split(' ')[0] ?? 'Profile';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="back"
          variant="ghost"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {firstName}
        </Text>
        {!isSelf ? (
          <IconButton icon="dots" onPress={openMenu} accessibilityLabel="More options" />
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero photo card */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.hero}>
          {mainPhoto ? (
            <Image
              source={{ uri: mainPhoto }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={styles.heroFallback}>
              <Avatar name={profile.name} size={96} />
            </View>
          )}
          <Svg style={styles.heroGradient} pointerEvents="none">
            <Defs>
              <LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#0F182C" stopOpacity={0} />
                <Stop offset="1" stopColor="#0F182C" stopOpacity={0.6} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#heroFade)" />
          </Svg>
          <View style={styles.heroInfo}>
            <View style={styles.heroNameRow}>
              <Text style={styles.heroName}>{profile.name}</Text>
              <VerifiedBadge size={18} />
              {isPremium(profile) && <PremiumBadge size={18} />}
            </View>
            {profile.username ? (
              <Text style={styles.heroUsername}>@{profile.username}</Text>
            ) : null}
            <View style={styles.heroMetaRow}>
              <Icon name="thumbsUp" size={13} color="#fff" strokeWidth={2} />
              <Text style={styles.heroThumbs}>
                {profile.thumbs_count ?? 0}
              </Text>
              {(profile.age != null || profile.city) && (
                <Text style={styles.heroMeta}>
                  · {[profile.age, profile.city].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
          </View>
        </Animated.View>

        {/* Thumbs action */}
        {!isSelf && !blocked && (
          <Animated.View entering={FadeInDown.delay(60).duration(400)}>
            <PressableScale
              scaleTo={0.95}
              style={[styles.thumbsPill, thumbed && styles.thumbsPillActive]}
              onPress={() => toggleThumb.mutate()}
              disabled={toggleThumb.isPending}
            >
              <Icon name="thumbsUp" size={16} color={COLORS.success} strokeWidth={2} />
              <Text style={styles.thumbsCount}>
                {profile.thumbs_count ?? 0}
              </Text>
              <Text style={styles.thumbsLabel}>
                {thumbed ? 'Thumbed' : 'Give thumbs'}
              </Text>
            </PressableScale>
          </Animated.View>
        )}

        {/* Stats */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(400)}
          style={styles.stats}
        >
          <View style={styles.stat}>
            <Text style={styles.statValue}>{profile.events_hosted}</Text>
            <Text style={styles.statLabel}>Hosted</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {profile.events_attended ?? 0}
            </Text>
            <Text style={styles.statLabel}>Attended</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{profile.friends_count}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
        </Animated.View>

        {/* Bio prompt card */}
        {profile.bio ? (
          <Animated.View
            entering={FadeInDown.delay(140).duration(400)}
            style={styles.promptCard}
          >
            <Text style={styles.promptLabel}>About</Text>
            <Text style={styles.promptText}>{profile.bio}</Text>
          </Animated.View>
        ) : null}

        {/* Photos */}
        {gallery.length > 1 && (
          <Animated.View entering={FadeInDown.delay(180).duration(400)}>
            <SectionLabel style={styles.sectionLabel}>Photos</SectionLabel>
            <View style={styles.photoGrid}>
              {gallery.slice(1).map((uri, i) => (
                <Image
                  key={`${uri}-${i}`}
                  source={{ uri }}
                  style={styles.photo}
                  contentFit="cover"
                  transition={200}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {/* Interests */}
        {(profile.interests?.length ?? 0) > 0 && (
          <Animated.View entering={FadeInDown.delay(220).duration(400)}>
            <SectionLabel style={styles.sectionLabel}>Interests</SectionLabel>
            <View style={styles.pills}>
              {profile.interests.map((id) => {
                const a = ACTIVITY_MAP[id];
                if (!a) return null;
                const cat = categoryStyle(id);
                return (
                  <View
                    key={id}
                    style={[styles.pill, { backgroundColor: cat.tint }]}
                  >
                    <Icon name={id as IconName} size={15} color={cat.accent} />
                    <Text style={[styles.pillLabel, { color: cat.accent }]}>
                      {a.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        )}

        {!isSelf && blocked && (
          <View style={styles.blockedBanner}>
            <Text style={styles.blockedText}>You blocked this user.</Text>
            <Button
              label={unblock.isPending ? 'Unblocking…' : 'Unblock'}
              variant="secondary"
              height={44}
              onPress={() => unblock.mutate()}
              disabled={unblock.isPending}
            />
          </View>
        )}
      </ScrollView>

      {/* Sticky action bar */}
      {!isSelf && !blocked && (
        <View style={styles.actionBar}>
          {rel.status === 'friends' ? (
            <>
              <Button
                label="Message"
                height={46}
                style={{ flex: 1 }}
                onPress={() => router.push(`/(tabs)/chats/dm/${userId}`)}
              />
              <PressableScale
                scaleTo={0.92}
                style={styles.squareBtn}
                onPress={handleUnfriend}
                disabled={remove.isPending}
                accessibilityLabel="Remove friend"
              >
                <Icon name="check" size={20} color="rgba(15,24,44,0.6)" />
              </PressableScale>
            </>
          ) : rel.status === 'request_sent' ? (
            <Button
              label="Requested · tap to withdraw"
              variant="secondary"
              height={46}
              style={{ flex: 1 }}
              disabled={remove.isPending}
              onPress={() =>
                remove.mutate(rel.friendshipId!, {
                  onError: (e: any) => Alert.alert('Error', e.message),
                })
              }
            />
          ) : rel.status === 'request_received' ? (
            <>
              <Button
                label="Accept request"
                height={46}
                style={{ flex: 1 }}
                disabled={accept.isPending}
                onPress={() => accept.mutate(rel.friendshipId!)}
              />
              <PressableScale
                scaleTo={0.92}
                style={styles.squareBtn}
                disabled={remove.isPending}
                onPress={() =>
                  remove.mutate(rel.friendshipId!, {
                    onError: (e: any) => Alert.alert('Error', e.message),
                  })
                }
                accessibilityLabel="Decline request"
              >
                <Icon name="close" size={20} color="rgba(15,24,44,0.6)" />
              </PressableScale>
            </>
          ) : (
            <Button
              label="Add friend"
              height={46}
              style={{ flex: 1 }}
              onPress={handleAddFriend}
            />
          )}
        </View>
      )}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FONTS.heavy,
    fontSize: 22,
    letterSpacing: -0.44,
    color: COLORS.textPrimary,
  },
  scroll: { padding: 16, gap: 12, paddingBottom: 24 },
  hero: {
    height: 300,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    shadowColor: '#0F182C',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  heroFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryTint,
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 110,
  },
  heroInfo: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 14,
  },
  heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heroName: { fontFamily: FONTS.heavy, fontSize: 23, color: '#fff' },
  heroUsername: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  heroThumbs: { fontFamily: FONTS.bold, fontSize: 12, color: '#fff' },
  heroMeta: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  thumbsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 100,
    backgroundColor: 'rgba(31,164,99,0.10)',
  },
  thumbsPillActive: {
    borderWidth: 1.5,
    borderColor: COLORS.success,
  },
  thumbsCount: {
    fontFamily: FONTS.heavy,
    fontSize: 15,
    color: COLORS.success,
  },
  thumbsLabel: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.success,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingVertical: 14,
    shadowColor: '#0F182C',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  stat: { alignItems: 'center', flex: 1 },
  statValue: {
    fontFamily: FONTS.heavy,
    fontSize: 19,
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    color: 'rgba(15,24,44,0.5)',
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(15,24,44,0.1)',
  },
  promptCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#0F182C',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  promptLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: 'rgba(15,24,44,0.5)',
  },
  promptText: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    lineHeight: 20,
    color: COLORS.textPrimary,
    marginTop: 5,
  },
  sectionLabel: { marginTop: 6, marginBottom: 10, marginLeft: 4 },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photo: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    height: 34,
    borderRadius: 100,
  },
  pillLabel: { fontFamily: FONTS.bold, fontSize: 12.5 },
  blockedBanner: { alignItems: 'center', gap: 10, marginTop: 8 },
  blockedText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  actionBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,24,44,0.08)',
  },
  squareBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
