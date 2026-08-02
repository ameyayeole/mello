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
//
// `onDark` flips the card onto the inverted ink ramp for the profile, whose
// sheet is already dark `onPhoto` glass over the user's photo — a light panel
// card there reads as a hole punched in the sheet. Every text/surface colour in
// the subtree has two rungs, so the flag has to travel all the way down;
// EventRow carries the same flag for the same reason (DESIGN.md).
export function PostCard({
  post,
  onOverflow,
  onComment,
  mentionables,
  profileUserId,
  onDark = false,
}: {
  post: CommunityPost;
  onOverflow: (post: CommunityPost) => void;
  onComment: (post: CommunityPost) => void;
  mentionables?: Map<string, string>;
  profileUserId?: string;
  onDark?: boolean;
}) {
  return (
    <Glass
      tier={onDark ? 'onPhoto' : 'panel'}
      radius={RADIUS['2xl']}
      style={styles.card}
    >
      {/* Overflow is now on every post — the screen's handler branches on
          ownership (Delete for your own, Report for others'). */}
      <PostAuthorRow
        post={post}
        onOverflow={() => onOverflow(post)}
        onDark={onDark}
      />
      {post.type === 'text' && post.body ? (
        <TextPostBody
          body={post.body}
          mentionables={mentionables}
          onDark={onDark}
        />
      ) : null}
      {post.type === 'photo' && post.media.length > 0 ? (
        <View style={styles.media}>
          <PhotoCarousel media={post.media} />
          {post.body ? (
            <TextPostBody
              body={post.body}
              mentionables={mentionables}
              onDark={onDark}
            />
          ) : null}
        </View>
      ) : null}
      {post.type === 'poll' ? (
        <View style={styles.media}>
          <PollCard postId={post.id} question={post.body ?? ''} onDark={onDark} />
        </View>
      ) : null}
      {post.type === 'shared_wrap' && post.ref_wrap_event_id ? (
        <SharedWrapCard
          eventId={post.ref_wrap_event_id}
          caption={post.body ?? ''}
          onDark={onDark}
        />
      ) : null}
      <PostActionBar
        post={post}
        onComment={onComment}
        profileUserId={profileUserId}
        onDark={onDark}
      />
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
