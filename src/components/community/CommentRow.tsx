import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Avatar, IconButton, PressableScale, Icon } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { PostComment } from '@/types/models';
import { relativeTime } from '@/utils/time';
import { useCommentReplies, useToggleCommentLike } from '@/hooks/useComments';
// Reuse the chat mention renderer — @handles in the pool tap through to profiles.
import MentionText from '@/components/chat/MentionText';

// One comment. Top-level rows carry a Reply link + an expandable "View N replies"
// that lazy-loads its chronological replies (rendered as reply-variant rows, one
// level only — replies have no Reply link). Every non-deleted row (top-level or
// reply) has an optimistic like heart. A tombstone (deleted) shows "comment
// removed" and keeps its replies. The overflow bubbles to the sheet, which
// presents Delete (own / post author) and/or Report (others').
export function CommentRow({
  comment,
  postId,
  parentId,
  meId,
  isPostAuthor,
  isReply,
  mentionables,
  onReply,
  onOverflow,
}: {
  comment: PostComment;
  postId: string;
  parentId?: string;
  meId: string | undefined;
  isPostAuthor: boolean;
  isReply?: boolean;
  // lowercase username → user id; @handles found here render tappable.
  mentionables?: Map<string, string>;
  // parentId = the top-level comment to attach the new reply to (stays one level
  // deep); prefill seeds the composer ("@user " when replying to a reply).
  onReply: (parentId: string, prefill: string, toName: string) => void;
  onOverflow: (c: PostComment) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const replies = useCommentReplies(comment.id, expanded && !isReply);
  const toggleLike = useToggleCommentLike(postId);

  // Subtle heart pop driven from an effect (the repo's accepted place to write a
  // shared value — a write in the press handler trips react-hooks/immutability).
  const [pulse, setPulse] = useState(0);
  const pop = useSharedValue(1);
  useEffect(() => {
    if (pulse === 0) return;
    pop.value = withSequence(
      withTiming(1.18, { duration: 110, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) })
    );
  }, [pulse, pop]);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  function onLike() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPulse((n) => n + 1);
    toggleLike.mutate({
      commentId: comment.id,
      parentId: parentId ?? null,
      liked: comment.liked_by_me,
    });
  }

  const replyCount = comment.reply_count ?? 0;
  const showActions = !comment.deleted || (!isReply && replyCount > 0);

  return (
    <View style={[styles.row, isReply && styles.replyRow]}>
      <PressableScale
        onPress={() =>
          router.push(
            comment.author_id === meId
              ? '/(tabs)/profile'
              : `/friends/${comment.author_id}`
          )
        }
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
          {!comment.deleted && meId ? (
            <IconButton
              icon="dots"
              variant="ghost"
              size={26}
              iconSize={15}
              onPress={() => onOverflow(comment)}
              accessibilityLabel="Comment options"
            />
          ) : null}
        </View>

        {comment.deleted ? (
          <Text style={styles.removed}>comment removed</Text>
        ) : (
          <MentionText
            content={comment.body ?? ''}
            style={styles.text}
            mentionables={mentionables}
          />
        )}

        {showActions ? (
          <View style={styles.actions}>
            {!comment.deleted ? (
              <PressableScale
                onPress={onLike}
                style={styles.like}
                accessibilityRole="button"
                accessibilityLabel={comment.liked_by_me ? 'Unlike' : 'Like'}
              >
                <Animated.View style={heartStyle}>
                  <Icon
                    name="heart"
                    variant={comment.liked_by_me ? 'bold' : 'linear'}
                    size={16}
                    color={comment.liked_by_me ? COLORS.primary : COLORS.textMuted}
                  />
                </Animated.View>
                {comment.like_count > 0 ? (
                  <Text style={styles.action}>{comment.like_count}</Text>
                ) : null}
              </PressableScale>
            ) : null}
            {!comment.deleted ? (
              <PressableScale
                onPress={() =>
                  // Reply attaches to the top-level ancestor (parentId ?? own id).
                  // Every reply — to a top-level comment or to a reply — seeds the
                  // lowercase @handle (not the display name, which capitalises) so
                  // it resolves to a real mention; the banner still shows the name.
                  onReply(
                    parentId ?? comment.id,
                    `@${comment.author_username} `,
                    comment.author_name
                  )
                }
              >
                <Text style={styles.action}>Reply</Text>
              </PressableScale>
            ) : null}
            {!isReply && replyCount > 0 ? (
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
                parentId={comment.id}
                meId={meId}
                isPostAuthor={isPostAuthor}
                isReply
                mentionables={mentionables}
                onReply={onReply}
                onOverflow={onOverflow}
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[4],
    marginTop: SPACING[1],
  },
  like: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1] },
  action: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
});
