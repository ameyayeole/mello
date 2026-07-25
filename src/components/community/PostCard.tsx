import { View, Text, StyleSheet } from 'react-native';
import { Glass } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';
import { CommunityPost } from '@/types/models';
import { PostAuthorRow } from './PostAuthorRow';
import { TextPostBody } from './TextPostBody';

// One post in the feed. Phase 1 renders text posts only; photo/poll/shared_wrap
// arrive in Phases 3–5, each as another branch here. The like/comment/share
// action bar is Phase 2 — this phase shows read-only counts so the card's
// footer geometry is settled before interactions land on it.
export function PostCard({
  post,
  isOwn,
  onOverflow,
}: {
  post: CommunityPost;
  isOwn: boolean;
  onOverflow: (post: CommunityPost) => void;
}) {
  return (
    <Glass tier="panel" radius={RADIUS['2xl']} style={styles.card}>
      <PostAuthorRow
        post={post}
        onOverflow={isOwn ? () => onOverflow(post) : undefined}
      />
      {post.type === 'text' && post.body ? (
        <TextPostBody body={post.body} />
      ) : null}
      <View style={styles.footer}>
        <Text style={styles.count}>{post.like_count} likes</Text>
        <Text style={styles.count}>{post.comment_count} comments</Text>
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: { padding: SPACING[4], gap: SPACING[1] },
  footer: {
    flexDirection: 'row',
    gap: SPACING[4],
    marginTop: SPACING[3],
  },
  count: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
});
