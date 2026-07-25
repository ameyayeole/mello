import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Sheet,
  NavButton,
  Loader,
  EmptyState,
  PressableScale,
} from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost, PostComment } from '@/types/models';
import {
  useComments,
  useAddComment,
  useDeleteComment,
  useSetCommentsEnabled,
} from '@/hooks/useComments';
import { CommentRow } from './CommentRow';
import { CommentComposer } from './CommentComposer';

// The comment thread for one post: a capped, scrollable list of top-level
// CommentRows (each with lazy replies) + a pinned composer. The post's author
// gets a comments on/off toggle; when off, the composer is replaced by a notice.
// Delete confirmation + the delete mutation live here (the rows just request it),
// mirroring how the feed screen owns its delete Dialog.
export function CommentSheet({
  post,
  visible,
  onClose,
}: {
  post: CommunityPost;
  visible: boolean;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const meId = useAuthStore((s) => s.user?.id);
  const isPostAuthor = post.author_id === meId;

  const comments = useComments(post.id);
  const add = useAddComment(post.id);
  const del = useDeleteComment(post.id);
  const toggle = useSetCommentsEnabled(post.id);

  const [replyingTo, setReplyingTo] = useState<PostComment | null>(null);
  const [commentsOn, setCommentsOn] = useState(post.comments_enabled);

  const listMax = height * 0.52;

  function submit(body: string) {
    add.mutate(
      { body, parentId: replyingTo?.id ?? null },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setReplyingTo(null);
        },
        onError: () =>
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
      }
    );
  }

  // Native Alert, not a Dialog: a Dialog is a Modal, and nesting it inside the
  // Sheet's Modal fails to render on Android. Alert layers above modals reliably.
  function requestDelete(comment: PostComment) {
    Alert.alert('Delete comment?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          del.mutate(
            {
              commentId: comment.id,
              hasReplies: (comment.reply_count ?? 0) > 0,
            },
            {
              onSuccess: () =>
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success
                ),
              onError: () =>
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Error
                ),
            }
          ),
      },
    ]);
  }

  function flipComments() {
    const next = !commentsOn;
    setCommentsOn(next);
    Haptics.selectionAsync();
    toggle.mutate(next, { onError: () => setCommentsOn(!next) });
  }

  const data = comments.data ?? [];

  return (
    <Sheet visible={visible} onClose={onClose} keyboardAvoiding grabber style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Comments</Text>
        <View style={styles.headerRight}>
          {isPostAuthor ? (
            <PressableScale onPress={flipComments} accessibilityLabel="Toggle comments">
              <Text style={styles.toggle}>
                {commentsOn ? 'Turn off' : 'Turn on'}
              </Text>
            </PressableScale>
          ) : null}
          <NavButton icon="close" onPress={onClose} accessibilityLabel="Close" />
        </View>
      </View>

      {comments.isLoading ? (
        <View style={styles.loading}>
          <Loader />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          style={{ maxHeight: listMax }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <CommentRow
              comment={item}
              postId={post.id}
              meId={meId}
              isPostAuthor={isPostAuthor}
              onReply={setReplyingTo}
              onRequestDelete={requestDelete}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="chat"
              title="No comments yet"
              body="Be the first to say something."
            />
          }
        />
      )}

      {commentsOn ? (
        <CommentComposer
          replyingTo={replyingTo}
          onSubmit={submit}
          onCancelReply={() => setReplyingTo(null)}
          pending={add.isPending}
        />
      ) : (
        <Text style={styles.off}>Comments are turned off</Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { padding: SPACING[5], gap: SPACING[4] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3] },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    color: COLORS.textPrimary,
  },
  toggle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.primary,
  },
  loading: { paddingVertical: SPACING[8] },
  list: { gap: SPACING[4], paddingVertical: SPACING[2] },
  off: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING[3],
  },
});
