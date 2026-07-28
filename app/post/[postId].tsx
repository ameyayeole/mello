import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import {
  Screen,
  ScreenHeader,
  Loader,
  EmptyState,
  Dialog,
  PressableScale,
} from '@/components/ui';
import { PostCard } from '@/components/community/PostCard';
import { CommentSheet } from '@/components/community/CommentSheet';
import { usePost } from '@/hooks/usePost';
import { useDeletePost } from '@/hooks/usePostMutations';
import { useThreadMentionables } from '@/hooks/useMentions';
import { reportPost } from '@/services/moderation.service';
import { useAuthStore } from '@/stores/authStore';
import { CommunityPost } from '@/types/models';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';

// A single-post screen reached at mello://post/<id> (deep link) and from a
// notification tap. It's a one-post Community screen: the same PostCard plus the
// same delete-own / report-other / comment handlers the feed uses.
export default function PostDetailScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const router = useRouter();
  const meId = useAuthStore((s) => s.user?.id);
  const q = usePost(postId!);
  const del = useDeletePost();
  const [commentPost, setCommentPost] = useState<CommunityPost | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CommunityPost | null>(null);
  const [reportTarget, setReportTarget] = useState<CommunityPost | null>(null);
  const post = q.data ?? null;
  const mentionables = useThreadMentionables(post ? [post] : []);

  const report = useMutation({
    mutationFn: (p: CommunityPost) =>
      reportPost({
        reporterId: meId!,
        reportedId: p.author_id,
        postId: p.id,
        reason: 'inappropriate',
      }),
  });

  function onOverflow(p: CommunityPost) {
    if (p.author_id === meId) setPendingDelete(p);
    else setReportTarget(p);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    del.mutate(pendingDelete.id, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPendingDelete(null);
        router.back(); // the post is gone; leave the now-dead screen
      },
      onError: () =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    });
  }

  function confirmReport() {
    if (!reportTarget) return;
    report.mutate(reportTarget, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setReportTarget(null);
      },
      onError: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setReportTarget(null);
      },
    });
  }

  return (
    <Screen>
      <ScreenHeader title="Post" />
      {q.isLoading ? (
        <Loader />
      ) : !post ? (
        <EmptyState
          icon="close"
          title="Post unavailable"
          body="It may have been deleted or isn't visible to you."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <PostCard
            post={post}
            onOverflow={onOverflow}
            onComment={setCommentPost}
            mentionables={mentionables}
          />
        </ScrollView>
      )}

      {commentPost && (
        <CommentSheet
          post={commentPost}
          visible={!!commentPost}
          onClose={() => setCommentPost(null)}
        />
      )}

      {/* Delete + Report dialogs — same shape as the feed's (community.tsx). */}
      <Dialog visible={!!pendingDelete} onClose={() => setPendingDelete(null)}>
        <Text style={styles.dialogTitle}>Delete post?</Text>
        <Text style={styles.dialogBody}>This can&apos;t be undone.</Text>
        <View style={styles.dialogRow}>
          <PressableScale
            scaleTo={0.96}
            style={[styles.dialogBtn, styles.cancel]}
            onPress={() => setPendingDelete(null)}
          >
            <Text style={styles.cancelLabel}>Cancel</Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.96}
            style={[styles.dialogBtn, styles.danger]}
            onPress={confirmDelete}
            disabled={del.isPending}
          >
            <Text style={styles.dangerLabel}>Delete</Text>
          </PressableScale>
        </View>
      </Dialog>

      <Dialog visible={!!reportTarget} onClose={() => setReportTarget(null)}>
        <Text style={styles.dialogTitle}>Report post?</Text>
        <Text style={styles.dialogBody}>
          Our team will review it. Posts reported by several people are hidden
          automatically.
        </Text>
        <View style={styles.dialogRow}>
          <PressableScale
            scaleTo={0.96}
            style={[styles.dialogBtn, styles.cancel]}
            onPress={() => setReportTarget(null)}
          >
            <Text style={styles.cancelLabel}>Cancel</Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.96}
            style={[styles.dialogBtn, styles.danger]}
            onPress={confirmReport}
            disabled={report.isPending}
          >
            <Text style={styles.dangerLabel}>Report</Text>
          </PressableScale>
        </View>
      </Dialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: SPACING[4], paddingBottom: SPACING[8] },
  dialogTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  dialogBody: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[2],
  },
  dialogRow: {
    flexDirection: 'row',
    gap: SPACING[2],
    alignSelf: 'stretch',
    marginTop: SPACING[4],
  },
  dialogBtn: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { backgroundColor: COLORS.inkSubtle },
  cancelLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  danger: { backgroundColor: COLORS.error },
  dangerLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.white,
  },
});
