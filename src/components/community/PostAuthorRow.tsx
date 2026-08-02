import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar, IconButton, PressableScale } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';
import { relativeTime } from '@/utils/time';

// Avatar + name + city · time, with an overflow button on the right. The
// avatar+name block taps through to the author's profile (same /friends/[id]
// route ParticipantRow uses). The overflow's menu (delete / report) is wired by
// the parent card. `onOverflow` is only passed for the current user's own posts
// (delete); other authors' posts render no trailing control this phase.
export function PostAuthorRow({
  post,
  onOverflow,
  onDark = false,
}: {
  post: CommunityPost;
  onOverflow?: () => void;
  onDark?: boolean;
}) {
  const router = useRouter();
  const meId = useAuthStore((s) => s.user?.id);
  // Tapping your own author row goes to your profile tab, not the other-user
  // /friends/[id] view.
  const openProfile = () =>
    router.push(
      post.author_id === meId ? '/(tabs)/profile' : `/friends/${post.author_id}`
    );
  const meta = [post.city, relativeTime(post.created_at)]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.row}>
      <PressableScale
        style={styles.author}
        scaleTo={0.98}
        onPress={openProfile}
        accessibilityRole="button"
        accessibilityLabel={`View ${post.author_name}'s profile`}
      >
        <Avatar name={post.author_name} photoUrl={post.author_photo_url} size={40} />
        <View style={styles.text}>
          <Text style={[styles.name, onDark && styles.nameOnDark]} numberOfLines={1}>
            {post.author_name}
          </Text>
          <Text style={[styles.meta, onDark && styles.metaOnDark]} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </PressableScale>
      {onOverflow ? (
        <IconButton
          icon="dots"
          variant="ghost"
          size={32}
          iconSize={18}
          color={onDark ? COLORS.textOnDark : undefined}
          onPress={onOverflow}
          accessibilityLabel="Post options"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  author: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
  },
  text: { flex: 1 },
  name: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textPrimary,
  },
  nameOnDark: { color: COLORS.white },
  meta: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  metaOnDark: { color: COLORS.textOnDarkMuted },
});
