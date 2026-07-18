import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Modal,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useWrapGallery } from '@/hooks/useWrapGallery';
import WrapPhotoTile from '@/components/wrap/WrapPhotoTile';
import OptionSheet, { SheetOption } from '@/components/chat/OptionSheet';
import {
  isMediaLibraryAvailable,
  saveImagesToLibrary,
} from '@/services/storage.service';
import { deleteWrapPhoto } from '@/services/wrap.service';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { PhotoReportReason, WrapPhoto } from '@/types/models';
import { Avatar, Icon, IconButton, PressableScale } from '@/components/ui';

const REPORT_REASONS: { reason: PhotoReportReason; label: string; icon: any }[] = [
  { reason: 'remove_me', label: "I don't want my photo included", icon: 'user' },
  { reason: 'inappropriate', label: 'Inappropriate content', icon: 'warning' },
  { reason: 'not_this_event', label: 'Not from this event', icon: 'calendar' },
  { reason: 'spam', label: 'Spam', icon: 'block' },
  { reason: 'other', label: 'Something else', icon: 'flag' },
];

// The shared pool: everyone's photos, like + one comment each, report menu,
// and (when the native module exists) download-all.
export default function WrapGalleryScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const user = useAuthStore((s) => s.user);
  const { sortedPhotos, photosQuery, like, comment, report } =
    useWrapGallery(eventId);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<WrapPhoto | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [canDownload, setCanDownload] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    isMediaLibraryAvailable().then(setCanDownload).catch(() => {});
  }, []);

  const viewer = useMemo(
    () => sortedPhotos.find((p) => p.id === viewerId) ?? null,
    [sortedPhotos, viewerId]
  );
  const myComment = viewer?.comments?.find((c) => c.user_id === user?.id);

  async function handleDownloadAll() {
    try {
      setDownloading(true);
      const saved = await saveImagesToLibrary(sortedPhotos.map((p) => p.url));
      Alert.alert('Saved', `${saved} photos saved to your library.`);
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setDownloading(false);
    }
  }

  function openProfile(userId: string) {
    setViewerId(null);
    router.push(`/friends/${userId}`);
  }

  const reportOptions: SheetOption[] = REPORT_REASONS.map((r) => ({
    icon: r.icon,
    label: r.label,
    danger: r.reason === 'inappropriate',
    onPress: () => {
      if (!reportTarget) return;
      const isRemoveMe = r.reason === 'remove_me';
      report.mutate(
        { photoId: reportTarget.id, reason: r.reason },
        {
          onSuccess: () => {
            if (isRemoveMe) setViewerId(null);
            Alert.alert(
              isRemoveMe ? 'Photo removed' : 'Report sent',
              isRemoveMe
                ? 'That photo is no longer part of this wrap.'
                : 'Thanks. Our team will take a look.'
            );
          },
        }
      );
      setReportTarget(null);
    },
  }));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton icon="back" variant="ghost" onPress={() => router.back()} accessibilityLabel="Back" />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Photo pool</Text>
          <Text style={styles.headerSub}>
            {sortedPhotos.length} {sortedPhotos.length === 1 ? 'photo' : 'photos'} · top 6 go to Explore
          </Text>
        </View>
        {canDownload && sortedPhotos.length > 0 ? (
          <IconButton
            icon="bookmark"
            onPress={downloading ? undefined : handleDownloadAll}
            accessibilityLabel="Save all photos to your library"
          />
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <FlatList
        data={sortedPhotos}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.grid}
        refreshing={photosQuery.isRefetching}
        onRefresh={() => photosQuery.refetch()}
        renderItem={({ item }) => (
          <WrapPhotoTile
            photo={item}
            mentioned={
              !!user &&
              (item.mentions.includes(user.id) ||
                (item.comments ?? []).some((c) => c.mentions.includes(user.id)))
            }
            onPress={() => setViewerId(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="image" size={34} color={COLORS.primary} strokeWidth={1.6} />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyText}>
              Photos everyone adds land in this shared pool.
            </Text>
            <PressableScale
              scaleTo={0.96}
              style={styles.emptyBtn}
              onPress={() => router.push(`/events/wrap/photos/${eventId}`)}
            >
              <Text style={styles.emptyBtnText}>Add yours</Text>
            </PressableScale>
          </View>
        }
      />

      {/* Full-screen photo viewer */}
      <Modal
        visible={!!viewer}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerId(null)}
        statusBarTranslucent
      >
        {viewer && (
          <View style={styles.viewerRoot}>
            <SafeAreaView style={{ flex: 1 }}>
              <View style={styles.viewerHeader}>
                <PressableScale
                  scaleTo={0.96}
                  style={styles.viewerUploader}
                  onPress={() => openProfile(viewer.uploader_id)}
                >
                  <Avatar
                    name={viewer.uploader?.name}
                    photoUrl={viewer.uploader?.photo_url}
                    size={34}
                  />
                  <Text style={styles.viewerName}>{viewer.uploader?.name}</Text>
                </PressableScale>
                <View style={styles.viewerHeaderRight}>
                  {viewer.uploader_id === user?.id && (
                    <IconButton
                      icon="trash"
                      variant="ghost"
                      color="#fff"
                      accessibilityLabel="Delete this photo"
                      onPress={() => {
                        Alert.alert('Delete photo?', 'It leaves the pool for everyone.', [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await deleteWrapPhoto(viewer.id);
                                setViewerId(null);
                                photosQuery.refetch();
                              } catch (e: any) {
                                Alert.alert('Error', e.message);
                              }
                            },
                          },
                        ]);
                      }}
                    />
                  )}
                  <IconButton
                    icon="flag"
                    variant="ghost"
                    color="#fff"
                    onPress={() => setReportTarget(viewer)}
                    accessibilityLabel="Report this photo"
                  />
                  <IconButton
                    icon="close"
                    variant="ghost"
                    color="#fff"
                    onPress={() => setViewerId(null)}
                    accessibilityLabel="Close"
                  />
                </View>
              </View>

              <Animated.View entering={FadeIn.duration(200)} style={styles.viewerImageWrap}>
                <Image
                  source={{ uri: viewer.url }}
                  style={styles.viewerImage}
                  contentFit="contain"
                  transition={150}
                />
              </Animated.View>

              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              >
                <Animated.View entering={FadeInDown.duration(250)} style={styles.viewerPanel}>
                  {viewer.caption ? (
                    <Text style={styles.viewerCaption}>{viewer.caption}</Text>
                  ) : null}

                  <View style={styles.viewerActions}>
                    <PressableScale
                      scaleTo={0.9}
                      style={[styles.likeBtn, viewer.myLike && styles.likeBtnOn]}
                      onPress={() =>
                        like.mutate({ photoId: viewer.id, liked: !!viewer.myLike })
                      }
                      accessibilityRole="button"
                      accessibilityLabel={viewer.myLike ? 'Unlike' : 'Like'}
                    >
                      <Icon
                        name="heart"
                        size={18}
                        color={viewer.myLike ? '#fff' : COLORS.primary}
                        strokeWidth={2.2}
                      />
                      <Text
                        style={[styles.likeText, viewer.myLike && styles.likeTextOn]}
                      >
                        {viewer.like_count}
                      </Text>
                    </PressableScale>
                  </View>

                  {(viewer.comments?.length ?? 0) > 0 && (
                    <ScrollView style={styles.commentList} keyboardShouldPersistTaps="handled">
                      {(viewer.comments ?? []).map((c) => (
                        <PressableScale
                          key={`${c.photo_id}-${c.user_id}`}
                          scaleTo={0.99}
                          style={styles.commentRow}
                          onPress={() => openProfile(c.user_id)}
                        >
                          <Avatar name={c.author?.name} photoUrl={c.author?.photo_url} size={26} />
                          <Text style={styles.commentText} numberOfLines={2}>
                            <Text style={styles.commentAuthor}>
                              {c.author?.name ?? 'Someone'}
                            </Text>{' '}
                            {c.content}
                          </Text>
                        </PressableScale>
                      ))}
                    </ScrollView>
                  )}

                  {!myComment ? (
                    <View style={styles.commentComposer}>
                      <TextInput
                        style={styles.commentInput}
                        placeholder="One comment each. Make it count…"
                        placeholderTextColor="rgba(255,255,255,0.5)"
                        value={commentDraft}
                        onChangeText={(t) => setCommentDraft(t.slice(0, 300))}
                      />
                      <IconButton
                        icon="send"
                        variant="tint"
                        onPress={() => {
                          if (!commentDraft.trim()) return;
                          comment.mutate({
                            photoId: viewer.id,
                            content: commentDraft.trim(),
                            mentions: [],
                          });
                          setCommentDraft('');
                        }}
                        accessibilityLabel="Send comment"
                      />
                    </View>
                  ) : (
                    <Text style={styles.commentedNote}>
                      You've used your one comment on this photo.
                    </Text>
                  )}
                </Animated.View>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </View>
        )}
      </Modal>

      <OptionSheet
        visible={!!reportTarget}
        title="Report this photo"
        options={reportOptions}
        onClose={() => setReportTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerCenter: { alignItems: 'center' },
  headerTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 17,
    letterSpacing: -0.34,
    color: COLORS.textPrimary,
  },
  headerSub: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  grid: { padding: 14, gap: 8, paddingBottom: 30 },
  column: { gap: 8 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 90, paddingHorizontal: 40 },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.textPrimary,
    marginTop: 6,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    height: 40,
    borderRadius: 100,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: { fontFamily: FONTS.bold, fontSize: 13.5, color: '#fff' },
  viewerRoot: { flex: 1, backgroundColor: 'rgba(8,12,22,0.98)' },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  viewerUploader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  viewerName: { fontFamily: FONTS.bold, fontSize: 14.5, color: '#fff' },
  viewerHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewerImageWrap: { flex: 1, justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerPanel: { padding: 16, paddingTop: 10, gap: 10 },
  viewerCaption: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    lineHeight: 20,
    color: '#fff',
  },
  viewerActions: { flexDirection: 'row', alignItems: 'center' },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 15,
    height: 38,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  likeBtnOn: { backgroundColor: COLORS.primary },
  likeText: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
  likeTextOn: { color: '#fff' },
  commentList: { maxHeight: 120 },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 5,
  },
  commentAuthor: { fontFamily: FONTS.bold, color: '#fff' },
  commentText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.85)',
  },
  commentComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentInput: {
    flex: 1,
    height: 42,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 16,
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    color: '#fff',
  },
  commentedNote: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
  },
});
