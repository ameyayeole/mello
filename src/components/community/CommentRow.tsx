import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar, IconButton, PressableScale } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { PostComment } from '@/types/models';
import { relativeTime } from '@/utils/time';
import { useCommentReplies } from '@/hooks/useComments';

// One comment. Top-level rows carry a Reply link + an expandable "View N replies"
// that lazy-loads its chronological replies (rendered as reply-variant rows, one
// level only — replies have no Reply link). A tombstone (deleted) shows "comment
// removed" and keeps its replies. The overflow (delete) shows for the comment's
// own author or the post's author; the parent sheet owns the confirm + mutation.
export function CommentRow({
  comment,
  postId,
  meId,
  isPostAuthor,
  isReply,
  onReply,
  onRequestDelete,
}: {
  comment: PostComment;
  postId: string;
  meId: string | undefined;
  isPostAuthor: boolean;
  isReply?: boolean;
  onReply: (c: PostComment) => void;
  onRequestDelete: (c: PostComment) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const replies = useCommentReplies(comment.id, expanded && !isReply);
  const canModerate =
    !comment.deleted && (comment.author_id === meId || isPostAuthor);
  const replyCount = comment.reply_count ?? 0;

  return (
    <View style={[styles.row, isReply && styles.replyRow]}>
      <PressableScale
        onPress={() => router.push(`/friends/${comment.author_id}`)}
        disabled={comment.deleted}
        accessibilityLabel={`View ${comment.author_name}'s profile`}
      >
        <Avatar
          name={comment.author_name}
          photoUrl={comment.author_photo_url}
          size={isReply ? 28 : 34}
        />
      </PressableScale>

      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={styles.name} numberOfLines={1}>
            {comment.deleted ? 'Someone' : comment.author_name}
          </Text>
          <Text style={styles.time}>{relativeTime(comment.created_at)}</Text>
          <View style={styles.spacer} />
          {canModerate ? (
            <IconButton
              icon="dots"
              variant="ghost"
              size={26}
              iconSize={15}
              onPress={() => onRequestDelete(comment)}
              accessibilityLabel="Comment options"
            />
          ) : null}
        </View>

        {comment.deleted ? (
          <Text style={styles.removed}>comment removed</Text>
        ) : (
          <Text style={styles.text}>{comment.body}</Text>
        )}

        {!isReply ? (
          <View style={styles.actions}>
            {!comment.deleted ? (
              <PressableScale onPress={() => onReply(comment)}>
                <Text style={styles.action}>Reply</Text>
              </PressableScale>
            ) : null}
            {replyCount > 0 ? (
              <PressableScale onPress={() => setExpanded((e) => !e)}>
                <Text style={styles.action}>
                  {expanded
                    ? 'Hide replies'
                    : `View ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
                </Text>
              </PressableScale>
            ) : null}
          </View>
        ) : null}

        {expanded && !isReply
          ? replies.data?.map((r) => (
              <CommentRow
                key={r.id}
                comment={r}
                postId={postId}
                meId={meId}
                isPostAuthor={isPostAuthor}
                isReply
                onReply={onReply}
                onRequestDelete={onRequestDelete}
              />
            ))
          : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING[2.5], alignItems: 'flex-start' },
  replyRow: { marginTop: SPACING[3] },
  body: { flex: 1, gap: SPACING[1] },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },
  name: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  time: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
  spacer: { flex: 1 },
  text: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.body,
    lineHeight: TYPE_SIZE.body * 1.35,
    color: COLORS.textPrimary,
  },
  removed: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  actions: { flexDirection: 'row', gap: SPACING[4], marginTop: SPACING[1] },
  action: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
});
