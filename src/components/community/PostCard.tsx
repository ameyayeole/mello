import { StyleSheet } from 'react-native';
import { Glass } from '@/components/ui';
import { SPACING, RADIUS } from '@/constants/spacing';
import { CommunityPost } from '@/types/models';
import { PostAuthorRow } from './PostAuthorRow';
import { TextPostBody } from './TextPostBody';
import { PostActionBar } from './PostActionBar';

// One post in the feed. Phase 1 renders text posts only; photo/poll/shared_wrap
// arrive in Phases 3–5, each as another branch here. The like/comment/share
// action bar (Phase 2a) replaces the old read-only counts row — like is
// optimistic, comment opens the Phase 2b sheet via onComment.
export function PostCard({
  post,
  isOwn,
  onOverflow,
  onComment,
}: {
  post: CommunityPost;
  isOwn: boolean;
  onOverflow: (post: CommunityPost) => void;
  onComment: (post: CommunityPost) => void;
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
      <PostActionBar post={post} onComment={onComment} />
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: { padding: SPACING[4], gap: SPACING[1] },
});
