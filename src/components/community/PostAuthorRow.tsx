import { View, Text, StyleSheet } from 'react-native';
import { Avatar, IconButton } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { CommunityPost } from '@/types/models';
import { relativeTime } from '@/utils/time';

// Avatar + name + city · time, with an overflow button on the right. The
// overflow's menu (delete / report) is wired by the parent card. `onOverflow`
// is only passed for the current user's own posts (delete); other authors'
// posts render no trailing control this phase — report arrives later.
export function PostAuthorRow({
  post,
  onOverflow,
}: {
  post: CommunityPost;
  onOverflow?: () => void;
}) {
  const meta = [post.city, relativeTime(post.created_at)]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.row}>
      <Avatar name={post.author_name} photoUrl={post.author_photo_url} size={40} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {post.author_name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {onOverflow ? (
        <IconButton
          icon="dots"
          variant="ghost"
          size={32}
          iconSize={18}
          onPress={onOverflow}
          accessibilityLabel="Post options"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  text: { flex: 1 },
  name: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textPrimary,
  },
  meta: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
    marginTop: 1,
  },
});
