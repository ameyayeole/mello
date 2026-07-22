import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { getProfile } from '@/services/auth.service';
import { useAuthStore } from '@/stores/authStore';
import { useFriends } from '@/hooks/useFriends';
import { isPremium } from '@/utils/premium';
import { showError } from '@/utils/errors';
import {
  Avatar,
  Button,
  Icon,
  Loader,
  PremiumBadge,
  VerifiedBadge,
} from '@/components/ui';

// A person, without leaving where you are. Opened from a chat avatar and from
// the Inbox search when the person isn't a friend yet.
//
// Deliberately a summary, not the profile screen: friends/[userId] is a
// full-bleed hero sheet with a parallaxing photo, its own scroll choreography
// and a photo viewer, none of which survives being nested in a sheet. What is
// here is who they are and what you can do about it — "View full profile"
// covers the rest.

export interface ProfileBottomSheetRef {
  open: (userId: string) => void;
  close: () => void;
}

const SNAP = ['52%'];

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const ProfileBottomSheet = forwardRef<ProfileBottomSheetRef, object>(
  (_props, ref) => {
    const sheetRef = useRef<BottomSheet>(null);
    // State, not a ref: changing who we're looking at has to re-run the query.
    const [userId, setUserId] = useState<string | null>(null);
    const router = useRouter();
    const me = useAuthStore((s) => s.user);
    const { relationshipWith, sendRequest, accept, remove } = useFriends();

    useImperativeHandle(ref, () => ({
      open: (id: string) => {
        setUserId(id);
        sheetRef.current?.expand();
      },
      close: () => sheetRef.current?.close(),
    }));

    const { data: profile, isLoading } = useQuery({
      queryKey: queryKeys.profile.of(userId),
      queryFn: () => getProfile(userId!),
      enabled: !!userId,
    });

    // Not memoised: it is a find over the cached friendship list, and pinning
    // it to deps would go stale the moment a request is accepted from here.
    const rel = userId && me ? relationshipWith(userId) : null;

    const close = useCallback(() => sheetRef.current?.close(), []);

    // Leaving for somewhere else: put the sheet away first, or it is still
    // sitting there when you come back.
    const goTo = useCallback(
      (path: string) => {
        close();
        router.push(path);
      },
      [close, router]
    );

    function actions() {
      if (!profile || !me || profile.id === me.id) return null;

      switch (rel?.status) {
        case 'friends':
          return (
            <Button
              label="Message"
              variant="primary"
              size="md"
              icon="chat"
              fullWidth
              onPress={() => goTo(`/(tabs)/chats/dm/${profile.id}`)}
            />
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
                remove.mutate(rel.friendshipId!, {
                  onError: (e) => showError(e),
                })
              }
            />
          );
        case 'request_received':
          return (
            <Button
              label="Accept request"
              variant="primary"
              size="md"
              fullWidth
              disabled={accept.isPending}
              onPress={() => accept.mutate(rel.friendshipId!)}
            />
          );
        default:
          return (
            <Button
              label="Add friend"
              variant="primary"
              size="md"
              icon="userPlus"
              fullWidth
              disabled={sendRequest.isPending}
              onPress={() =>
                sendRequest.mutate(profile.id, {
                  onError: (e) => showError(e),
                })
              }
            />
          );
      }
    }

    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={SNAP}
        enablePanDownToClose
        onClose={() => setUserId(null)}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handleBar}
      >
        <BottomSheetView style={styles.body}>
          {isLoading || !profile ? (
            <Loader />
          ) : (
            <>
              <View style={styles.head}>
                <Avatar
                  name={profile.name}
                  photoUrl={profile.photos?.[0] ?? profile.photo_url}
                  size={72}
                />
                <View style={styles.headText}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {profile.name}
                    </Text>
                    {profile.kyc_status === 'approved' && (
                      <VerifiedBadge size={16} />
                    )}
                    {isPremium(profile) && <PremiumBadge size={14} />}
                  </View>
                  {profile.username ? (
                    <Text style={styles.handle}>@{profile.username}</Text>
                  ) : null}
                  {profile.city ? (
                    <View style={styles.cityRow}>
                      <Icon
                        name="location"
                        size={13}
                        color={COLORS.textMuted}
                      />
                      <Text style={styles.city} numberOfLines={1}>
                        {profile.city}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {profile.bio ? (
                <Text style={styles.bio} numberOfLines={3}>
                  {profile.bio}
                </Text>
              ) : null}

              <View style={styles.stats}>
                <Stat value={profile.events_attended ?? 0} label="Attended" />
                <Stat value={profile.events_hosted ?? 0} label="Hosted" />
                <Stat value={profile.friends_count ?? 0} label="Friends" />
              </View>

              <View style={styles.actions}>
                {actions()}
                <Button
                  label="View full profile"
                  variant="tertiary"
                  size="md"
                  fullWidth
                  onPress={() => goTo(`/friends/${profile.id}`)}
                />
              </View>
            </>
          )}
        </BottomSheetView>
      </BottomSheet>
    );
  }
);

ProfileBottomSheet.displayName = 'ProfileBottomSheet';

export default ProfileBottomSheet;

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handleBar: { backgroundColor: COLORS.inkSubtle, width: 44 },
  body: {
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[2],
    paddingBottom: SPACING[8],
    gap: SPACING[4],
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3.5] },
  headText: { flex: 1, minWidth: 0, gap: SPACING[0.5] },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  name: {
    flexShrink: 1,
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.title,
    letterSpacing: -0.4,
    color: COLORS.textPrimary,
  },
  handle: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textMuted,
  },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1] },
  city: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
  bio: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  stats: {
    flexDirection: 'row',
    gap: SPACING[2],
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING[2.5],
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.background,
  },
  statValue: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.bodyLg,
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
    marginTop: SPACING[0.5],
  },
  actions: { gap: SPACING[2] },
});
