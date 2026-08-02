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
  onOverflow,
  onComment,
  mentionables,
  profileUserId,
}: {
  post: CommunityPost;
  onOverflow: (post: CommunityPost) => void;
  onComment: (post: CommunityPost) => void;
  mentionables?: Map<string, string>;
  profileUserId?: string;
}) {
  return (
    <Glass tier="onPhoto" radius={RADIUS['2xl']} style={styles.card}>
      {/* Overflow is now on every post — the screen's handler branches on
          ownership (Delete for your own, Report for others'). */}
      <PostAuthorRow post={post} onOverflow={() => onOverflow(post)} />
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
      <PostActionBar post={post} onComment={onComment} profileUserId={profileUserId} />
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
