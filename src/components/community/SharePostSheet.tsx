import { useMemo, useState } from 'react';
import { Text,
  ScrollView } from 'react-native';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { Sheet, Avatar, Button, PressableScale } from '@/components/ui';
import { useFriends } from '@/hooks/useFriends';
import { sendDirectMessage } from '@/services/dm.service';
import { sharePost } from '@/utils/sharePost';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { openDmChat } from '@/utils/chatActions';
import { themedStyles } from '@/theme';

// The post share picker: send the post's deep link straight into a friend's DM
// (a horizontal friend row), or hand off to the native sheet for external apps +
// the OS Copy action. Reuses sendDirectMessage + useFriends; no new backend.
export function SharePostSheet({
  post,
  visible,
  onClose,
}: {
  post: CommunityPost;
  visible: boolean;
  onClose: () => void;
}) {
  const meId = useAuthStore((s) => s.user?.id);
  const { friends } = useFriends();
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  // `Friendship.friend` is optional — keep only rows that carry the profile.
  const people = useMemo(
    () => friends.map((f) => f.friend).filter((p): p is NonNullable<typeof p> => !!p),
    [friends]
  );

  async function sendToFriend(friendId: string) {
    if (!meId || sendingTo) return;
    setSendingTo(friendId);
    const url = Linking.createURL(`post/${post.id}`);
    const preview = post.body
      ? `"${post.body.slice(0, 100)}"`
      : `${post.author_name} on Mello`;
    try {
      await sendDirectMessage(meId, friendId, `${preview}\n${url}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      openDmChat(friendId);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSendingTo(null);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} grabber style={styles.card}>
      <Text style={styles.title}>Share post</Text>

      {people.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {people.map((p) => (
            <PressableScale
              key={p.id}
              scaleTo={0.94}
              style={styles.friend}
              disabled={!!sendingTo}
              onPress={() => sendToFriend(p.id)}
              accessibilityRole="button"
              accessibilityLabel={`Send to ${p.name}`}
            >
              <Avatar name={p.name} photoUrl={p.photo_url} size={56} />
              <Text style={styles.friendName} numberOfLines={1}>
                {p.name}
              </Text>
            </PressableScale>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.empty}>Add friends to send posts directly.</Text>
      )}

      <Button
        variant="secondary"
        size="lg"
        label="Share to other apps"
        onPress={() => {
          onClose();
          sharePost(post);
        }}
        fullWidth
      />
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  card: { padding: SPACING[5], gap: SPACING[4] },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    color: COLORS.textPrimary,
  },
  row: { gap: SPACING[3], paddingVertical: SPACING[1] },
  friend: { alignItems: 'center', gap: SPACING[1.5], width: 68 },
  friendName: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textSecondary,
  },
  empty: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textMuted,
  },
}));
