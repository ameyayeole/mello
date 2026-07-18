import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Icon, PressableScale, VerifiedBadge } from '@/components/ui';
import { CoAttendee } from '@/types/models';

// Deck card for one person you met at the event. Tapping the card opens
// their profile; the action buttons live on the deck screen.
export default function RateCard({
  attendee,
  onAddFriend,
  friendState,
}: {
  attendee: CoAttendee;
  onAddFriend?: () => void;
  friendState?: 'none' | 'request_sent' | 'request_received' | 'friends';
}) {
  const router = useRouter();
  const initial = attendee.name?.trim()?.[0]?.toUpperCase() ?? '?';

  return (
    <PressableScale
      scaleTo={0.99}
      style={styles.card}
      onPress={() => router.push(`/friends/${attendee.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${attendee.name}'s profile`}
    >
      <View style={styles.photoArea}>
        {attendee.photo_url ? (
          <Image
            source={{ uri: attendee.photo_url }}
            style={styles.photo}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={styles.photoFallback}>
            <Text style={styles.photoInitial}>{initial}</Text>
          </View>
        )}
        {attendee.isHost && (
          <View style={styles.hostChip}>
            <Icon name="pin" size={12} color="#fff" strokeWidth={2.4} />
            <Text style={styles.hostChipText}>Host</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {attendee.name}
            {attendee.age ? `, ${attendee.age}` : ''}
          </Text>
          {attendee.kyc_status === 'approved' && <VerifiedBadge size={16} />}
        </View>
        {attendee.username ? (
          <Text style={styles.username}>@{attendee.username}</Text>
        ) : null}
        {attendee.bio ? (
          <Text style={styles.bio} numberOfLines={2}>
            {attendee.bio}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.thumbsPill}>
            <Icon
              name="thumbsUp"
              size={13}
              color={COLORS.primary}
              strokeWidth={2.2}
            />
            <Text style={styles.thumbsText}>{attendee.thumbs_count}</Text>
          </View>
          {onAddFriend && friendState !== 'friends' && (
            <PressableScale
              scaleTo={0.94}
              style={[
                styles.friendBtn,
                friendState === 'request_sent' && styles.friendBtnSent,
              ]}
              onPress={onAddFriend}
              disabled={friendState === 'request_sent'}
              accessibilityRole="button"
              accessibilityLabel={
                friendState === 'request_sent'
                  ? 'Friend request sent'
                  : `Add ${attendee.name} as a friend`
              }
            >
              <Icon
                name="userPlus"
                size={14}
                color={friendState === 'request_sent' ? COLORS.textMuted : '#fff'}
                strokeWidth={2.2}
              />
              <Text
                style={[
                  styles.friendBtnText,
                  friendState === 'request_sent' && styles.friendBtnTextSent,
                ]}
              >
                {friendState === 'request_sent' ? 'Requested' : 'Add friend'}
              </Text>
            </PressableScale>
          )}
          {friendState === 'friends' && (
            <View style={styles.friendsChip}>
              <Icon name="check" size={13} color={COLORS.success} strokeWidth={2.6} />
              <Text style={styles.friendsChipText}>Friends</Text>
            </View>
          )}
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    shadowColor: '#0F182C',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  photoArea: { flex: 1, backgroundColor: COLORS.primaryTint },
  photo: { width: '100%', height: '100%' },
  photoFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryTint,
  },
  photoInitial: {
    fontFamily: FONTS.heavy,
    fontSize: 72,
    color: COLORS.primary,
  },
  hostChip: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 100,
    backgroundColor: COLORS.accent,
  },
  hostChipText: { fontFamily: FONTS.bold, fontSize: 11.5, color: '#fff' },
  body: { padding: 16, paddingTop: 13 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: {
    fontFamily: FONTS.heavy,
    fontSize: 21,
    letterSpacing: -0.42,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  username: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  bio: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  thumbsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    height: 30,
    borderRadius: 100,
    backgroundColor: COLORS.primaryTint,
  },
  thumbsText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.primary,
  },
  friendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 100,
    backgroundColor: COLORS.primary,
  },
  friendBtnSent: { backgroundColor: 'rgba(15,24,44,0.06)' },
  friendBtnText: { fontFamily: FONTS.bold, fontSize: 12.5, color: '#fff' },
  friendBtnTextSent: { color: COLORS.textMuted },
  friendsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 100,
    backgroundColor: 'rgba(31,164,99,0.10)',
  },
  friendsChipText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.success,
  },
});
