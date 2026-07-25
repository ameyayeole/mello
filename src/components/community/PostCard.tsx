import { View, StyleSheet } from 'react-native';
import { Glass } from '@/components/ui';
import { SPACING, RADIUS } from '@/constants/spacing';
import { CommunityPost } from '@/types/models';
import { PostAuthorRow } from './PostAuthorRow';
import { TextPostBody } from './TextPostBody';
import { PhotoCarousel } from './PhotoCarousel';
import { PollCard } from './PollCard';
import { SharedWrapCard } from './SharedWrapCard';
import { PostActionBar } from './PostActionBar';

// One post in the feed. Text (Phase 1) and photo (Phase 3a) render here; poll /
// shared_wrap arrive in Phases 4–5 as more branches. The like/comment/share
// action bar (Phase 2a) replaces the old read-only counts row — like is
// optimistic, comment opens the Phase 2b sheet via onComment.
export function PostCard({
  post,
  isOwn,
  onOverflow,
  onComment,
  mentionables,
}: {
  post: CommunityPost;
  isOwn: boolean;
  onOverflow: (post: CommunityPost) => void;
  onComment: (post: CommunityPost) => void;
  mentionables?: Map<string, string>;
}) {
  return (
    <Glass tier="panel" radius={RADIUS['2xl']} style={styles.card}>
      <PostAuthorRow
        post={post}
        onOverflow={isOwn ? () => onOverflow(post) : undefined}
      />
      {post.type === 'text' && post.body ? (
        <TextPostBody body={post.body} mentionables={mentionables} />
      ) : null}
      {post.type === 'photo' && post.media.length > 0 ? (
        <View style={styles.media}>
          <PhotoCarousel media={post.media} />
          {post.body ? (
            <TextPostBody body={post.body} mentionables={mentionables} />
          ) : null}
        </View>
      ) : null}
      {post.type === 'poll' ? (
        <View style={styles.media}>
          <PollCard postId={post.id} question={post.body ?? ''} />
        </View>
      ) : null}
      {post.type === 'shared_wrap' && post.ref_wrap_event_id ? (
        <SharedWrapCard
          eventId={post.ref_wrap_event_id}
          caption={post.body ?? ''}
        />
      ) : null}
      <PostActionBar post={post} onComment={onComment} />
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: { padding: SPACING[4], gap: SPACING[1] },
  // Carousel + caption stack, with a little air above the caption. The photo is
  // inset within the card padding (rounded), not bled to the edge — the flat
  // Android glass fallback reads cleaner without an edge-touching image.
  media: { gap: SPACING[2], marginTop: SPACING[1] },
});
