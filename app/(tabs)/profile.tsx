import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Modal,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useAuthStore } from '@/stores/authStore';
import { ACTIVITY_MAP } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Gender } from '@/types/models';
import {
  Avatar,
  Icon,
  IconButton,
  IconName,
  PressableScale,
  SectionLabel,
  VerifiedBadge,
} from '@/components/ui';

const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  'non-binary': 'Non-binary',
  other: 'Other',
};

export default function ProfileTabScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { width } = useWindowDimensions();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

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
    user.age != null ? String(user.age) : null,
    user.gender ? GENDER_LABELS[user.gender] : null,
    user.city ?? null,
  ].filter(Boolean);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My profile</Text>
        <IconButton
          icon="settings"
          onPress={() => router.push('/profile/settings')}
          accessibilityLabel="Settings"
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero photo card */}
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
                  <Stop offset="0" stopColor="#0F182C" stopOpacity={0} />
                  <Stop offset="1" stopColor="#0F182C" stopOpacity={0.6} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#meFade)" />
            </Svg>
            <View style={styles.heroInfo}>
              <View style={styles.heroNameRow}>
                <Text style={styles.heroName}>{user.name}</Text>
                {user.kyc_status === 'approved' && <VerifiedBadge size={18} />}
              </View>
              <View style={styles.heroMetaRow}>
                <Icon name="thumbsUp" size={13} color="#fff" strokeWidth={2} />
                <Text style={styles.heroThumbs}>{user.thumbs_count ?? 0}</Text>
                {metaBits.length > 0 && (
                  <Text style={styles.heroMeta}>· {metaBits.join(' · ')}</Text>
                )}
              </View>
            </View>
            <PressableScale
              scaleTo={0.9}
              style={styles.editBadge}
              onPress={() => router.push('/profile/edit')}
            >
              <Icon name="edit" size={15} color={COLORS.textPrimary} />
            </PressableScale>
            {gallery.length > 1 && (
              <View style={styles.photoCountPill}>
                <Icon name="image" size={12} color="#fff" />
                <Text style={styles.photoCountText}>{gallery.length}</Text>
              </View>
            )}
          </PressableScale>
        </Animated.View>

        {/* Stats */}
        <Animated.View
          entering={FadeInDown.delay(70).duration(400)}
          style={styles.stats}
        >
          <View style={styles.stat}>
            <Text style={styles.statValue}>{user.events_hosted}</Text>
            <Text style={styles.statLabel}>Hosted</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{user.events_attended ?? 0}</Text>
            <Text style={styles.statLabel}>Attended</Text>
          </View>
          <View style={styles.statDivider} />
          <PressableScale
            style={styles.stat}
            scaleTo={0.94}
            onPress={() => router.push('/friends')}
          >
            <Text style={styles.statValue}>{user.friends_count}</Text>
            <Text style={styles.statLabel}>Friends ›</Text>
          </PressableScale>
        </Animated.View>

        {/* Bio prompt card */}
        {user.bio ? (
          <Animated.View
            entering={FadeInDown.delay(110).duration(400)}
            style={styles.promptCard}
          >
            <Text style={styles.promptLabel}>About me</Text>
            <Text style={styles.promptText}>{user.bio}</Text>
          </Animated.View>
        ) : null}

        {/* Interests */}
        {user.interests.length > 0 && (
          <Animated.View entering={FadeInDown.delay(150).duration(400)}>
            <SectionLabel style={styles.sectionLabel}>Interests</SectionLabel>
            <View style={styles.pills}>
              {user.interests.map((id) => {
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
            <IconButton
              icon="close"
              size={38}
              iconSize={18}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
  },
  headerTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 22,
    letterSpacing: -0.44,
    color: COLORS.textPrimary,
  },
  scroll: { padding: 16, gap: 12, paddingBottom: 28 },
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
    gap: 10,
    backgroundColor: COLORS.primaryTint,
  },
  heroFallbackHint: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.primary,
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
  editBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
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
  photoCountPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 100,
    backgroundColor: 'rgba(15,24,44,0.45)',
  },
  photoCountText: { fontFamily: FONTS.bold, fontSize: 11.5, color: '#fff' },
  viewer: { flex: 1, backgroundColor: '#0F182C' },
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
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  viewerCounter: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: '#fff',
  },
  viewerDots: {
    position: 'absolute',
    bottom: 46,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
  },
  viewerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  viewerDotActive: { backgroundColor: '#fff' },
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
});
