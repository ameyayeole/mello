import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  Alert,
  AlertButton,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useMutation } from '@tanstack/react-query';
import {
  Sheet,
  NavButton,
  Loader,
  EmptyState,
  PressableScale,
} from '@/components/ui';
import { reportComment, ReportReason } from '@/services/moderation.service';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { useAuthStore } from '@/stores/authStore';
import { useFriends } from '@/hooks/useFriends';
import { CommunityPost, PostComment, Profile } from '@/types/models';
import { Mentionable } from '@/components/chat/MentionAutocomplete';
import {
  useComments,
  useAddComment,
  useDeleteComment,
  useSetCommentsEnabled,
} from '@/hooks/useComments';
import { buildMentionables } from './commentMentions';
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
  const me = useAuthStore((s) => s.user);
  const meId = me?.id;
  const isPostAuthor = post.author_id === meId;

  const comments = useComments(post.id);

  // Mention pool: your friends + everyone already in this thread. Used both for
  // the composer's @-autocomplete (mentionPeople) and to decide which @handles
  // in a rendered body are tappable (mentionables map).
  const { friends } = useFriends();
  const friendProfiles = useMemo(
    () => friends.map((f) => f.friend).filter((p): p is Profile => !!p),
    [friends]
  );
  const mentionables = useMemo(
    () => buildMentionables(friendProfiles, comments.data, me),
    [friendProfiles, comments.data, me]
  );
  const mentionPeople = useMemo<Mentionable[]>(() => {
    const seen = new Set<string>();
    const out: Mentionable[] = [];
    const push = (
      id: string,
      username: string | undefined | null,
      name: string,
      photo_url: string | null
    ) => {
      if (!username || id === meId || seen.has(id)) return;
      seen.add(id);
      out.push({ id, username, name, photo_url });
    };
    for (const p of friendProfiles) push(p.id, p.username, p.name, p.photo_url);
    for (const c of comments.data ?? [])
      push(c.author_id, c.author_username, c.author_name, c.author_photo_url);
    return out;
  }, [friendProfiles, comments.data, meId]);
  const add = useAddComment(post.id);
  const del = useDeleteComment(post.id);
  const toggle = useSetCommentsEnabled(post.id);

  // parentId = the top-level comment a new reply attaches to; toName = who the
  // banner names; prefill = seed text ("@user " when replying to a reply).
  const [replyTarget, setReplyTarget] = useState<{
    parentId: string;
    toName: string;
    prefill: string;
  } | null>(null);
  const [commentsOn, setCommentsOn] = useState(post.comments_enabled);

  const onReply = (parentId: string, prefill: string, toName: string) =>
    setReplyTarget({ parentId, toName, prefill });

  const listMax = height * 0.52;

  function submit(body: string) {
    add.mutate(
      { body, parentId: replyTarget?.parentId ?? null },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setReplyTarget(null);
        },
        onError: () =>
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
      }
    );
  }

  const report = useMutation({
    mutationFn: (args: { comment: PostComment; reason: ReportReason }) =>
      reportComment({
        reporterId: meId!,
        reportedId: args.comment.author_id,
        commentId: args.comment.id,
        reason: args.reason,
      }),
    onSuccess: () =>
      Alert.alert('Report sent', 'Thanks — our team will review this.'),
    onError: () =>
      Alert.alert("Couldn't send report", 'Please try again.'),
  });

  // All confirms are native Alerts, not Dialogs: a Dialog is a Modal, and nesting
  // it inside the Sheet's Modal fails to render on Android. Alerts layer reliably.
  function confirmDelete(comment: PostComment) {
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

  function showReportReasons(comment: PostComment) {
    Alert.alert('Report comment', 'Why are you reporting it?', [
      { text: 'Spam', onPress: () => report.mutate({ comment, reason: 'spam' }) },
      {
        text: 'Harassment',
        onPress: () => report.mutate({ comment, reason: 'harassment' }),
      },
      {
        text: 'Inappropriate',
        onPress: () => report.mutate({ comment, reason: 'inappropriate' }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  // Contextual menu: Delete for the comment's author or the post author; Report
  // for anyone else's comment. The row shows the dots for any non-deleted comment.
  function onOverflow(comment: PostComment) {
    const canModerate = comment.author_id === meId || isPostAuthor;
    const isOwn = comment.author_id === meId;
    const buttons: AlertButton[] = [];
    if (canModerate) {
      buttons.push({
        text: 'Delete',
        style: 'destructive',
        onPress: () => confirmDelete(comment),
      });
    }
    if (!isOwn) {
      buttons.push({ text: 'Report', onPress: () => showReportReasons(comment) });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Comment', undefined, buttons);
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
              mentionables={mentionables}
              onReply={onReply}
              onOverflow={onOverflow}
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
          // Remount when the reply target changes so the field reseeds from
          // `prefill` (a key change is the setState-free way to reset state).
          key={replyTarget ? `${replyTarget.parentId}:${replyTarget.prefill}` : 'root'}
          replyToName={replyTarget?.toName ?? null}
          prefill={replyTarget?.prefill ?? ''}
          people={mentionPeople}
          onSubmit={submit}
          onCancelReply={() => setReplyTarget(null)}
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
