import { useMemo, useState } from 'react';
import { queryKeys } from '@/constants/queryKeys';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PhotoGridPicker } from '@/components/PhotoGridPicker';
import { CompleteMoment } from '@/components/wrap/CompleteMoment';
import { useWrapGallery } from '@/hooks/useWrapGallery';
import { useWrap } from '@/hooks/useWrap';
import { getCoAttendees, addWrapPhoto } from '@/services/wrap.service';
import { uploadWrapPhoto } from '@/services/storage.service';
import { useAuthStore } from '@/stores/authStore';
import { useQuery } from '@tanstack/react-query';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import {
  Avatar,
  Button,
  Icon,
  PressableScale,
  Screen,
  ScreenHeader,
} from '@/components/ui';
import { showError } from '@/utils/errors';

const MAX_PHOTOS = 4;

// Add your best photos to the pool. Caption + tags apply to this batch;
// the 6 most-liked photos of the event go public on Explore.
export default function WrapPhotosScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const user = useAuthStore((s) => s.user);
  const { sortedPhotos, photosQuery } = useWrapGallery(eventId);
  const { invalidate } = useWrap(eventId);

  const [picked, setPicked] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [tagged, setTagged] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [justUploaded, setJustUploaded] = useState(0);

  const attendeesQuery = useQuery({
    queryKey: queryKeys.wrapAttendees.of(eventId, user?.id),
    queryFn: () => getCoAttendees(eventId!, user!.id),
    enabled: !!eventId && !!user,
  });

  const myPhotos = useMemo(
    () => sortedPhotos.filter((p) => p.uploader_id === user?.id),
    [sortedPhotos, user?.id]
  );
  const slotsLeft = Math.max(0, MAX_PHOTOS - myPhotos.length);

  function toggleTag(id: string) {
    setTagged((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleUpload() {
    if (!user || !eventId || picked.length === 0) return;
    try {
      setUploading(true);
      const mentions = Array.from(tagged);
      for (const uri of picked.slice(0, slotsLeft)) {
        const url = await uploadWrapPhoto(user.id, eventId, uri);
        await addWrapPhoto({
          eventId,
          uploaderId: user.id,
          url,
          caption,
          mentions,
        });
      }
      setJustUploaded(picked.length);
      setPicked([]);
      setCaption('');
      setTagged(new Set());
      photosQuery.refetch();
      invalidate();
    } catch (e) {
      showError(e, 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Add your photos" tone="transparent" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {justUploaded > 0 ? (
            <View style={styles.completeWrap}>
              <CompleteMoment
                title={justUploaded === 1 ? 'Photo in the pool!' : 'Photos in the pool!'}
                sub="Likes decide the top 6. May the best shots win."
              >
                <View style={styles.completeActions}>
                  <Button
                    variant="tertiary"
                    label="See the gallery"
                    height={44}
                    onPress={() => router.replace(`/events/wrap/gallery/${eventId}`)}
                  />
                  {slotsLeft > 0 && (
                    <PressableScale scaleTo={0.96} onPress={() => setJustUploaded(0)} hitSlop={8}>
                      <Text style={styles.addMore}>Add more ({slotsLeft} left)</Text>
                    </PressableScale>
                  )}
                </View>
              </CompleteMoment>
            </View>
          ) : (
            <>
              {/* The competition stake, announced up front */}
              <Animated.View entering={FadeInDown.duration(350)} style={styles.stakeBanner}>
                <Icon name="crown" size={18} color={COLORS.primary} strokeWidth={2} />
                <Text style={styles.stakeText}>
                  The 6 most-liked photos go public on Explore as the event's
                  official wrap. Friendly competition, bring your best.
                </Text>
              </Animated.View>

              {myPhotos.length > 0 && (
                <Animated.View entering={FadeInDown.delay(60).duration(350)}>
                  <Text style={styles.sectionLabel}>
                    YOUR PHOTOS · {myPhotos.length}/{MAX_PHOTOS}
                  </Text>
                  <View style={styles.mineRow}>
                    {myPhotos.map((p) => (
                      <View key={p.id} style={styles.mineTile}>
                        <Image source={{ uri: p.url }} style={styles.mineImage} contentFit="cover" />
                        <View style={styles.mineLikes}>
                          <Icon name="heart" size={10} color="#fff" strokeWidth={2.4} />
                          <Text style={styles.mineLikesText}>{p.like_count}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </Animated.View>
              )}

              {slotsLeft > 0 ? (
                <>
                  <Animated.View entering={FadeInDown.delay(100).duration(350)}>
                    <Text style={styles.sectionLabel}>
                      PICK UP TO {slotsLeft} · ONLY YOUR BEST
                    </Text>
                    <PhotoGridPicker photos={picked} onChange={setPicked} max={slotsLeft} />
                  </Animated.View>

                  <Animated.View entering={FadeInDown.delay(140).duration(350)}>
                    <Text style={styles.sectionLabel}>CAPTION (OPTIONAL)</Text>
                    <TextInput
                      style={styles.captionInput}
                      placeholder="That golden hour though…"
                      placeholderTextColor="rgba(15,24,44,0.40)"
                      value={caption}
                      onChangeText={(t) => setCaption(t.slice(0, 300))}
                      multiline
                    />
                  </Animated.View>

                  {(attendeesQuery.data?.length ?? 0) > 0 && (
                    <Animated.View entering={FadeInDown.delay(180).duration(350)}>
                      <Text style={styles.sectionLabel}>TAG WHO'S IN THEM</Text>
                      <Text style={styles.tagHint}>
                        Tagged people see these photos first.
                      </Text>
                      <View style={styles.tagRow}>
                        {(attendeesQuery.data ?? []).map((a) => {
                          const on = tagged.has(a.id);
                          return (
                            <PressableScale
                              key={a.id}
                              scaleTo={0.95}
                              style={[styles.tagChip, on && styles.tagChipOn]}
                              onPress={() => toggleTag(a.id)}
                            >
                              <Avatar name={a.name} photoUrl={a.photo_url} size={22} />
                              <Text style={[styles.tagText, on && styles.tagTextOn]}>
                                {a.name.split(' ')[0]}
                              </Text>
                              {on && (
                                <Icon name="check" size={13} color={COLORS.primary} strokeWidth={2.6} />
                              )}
                            </PressableScale>
                          );
                        })}
                      </View>
                    </Animated.View>
                  )}
                </>
              ) : (
                <Animated.View entering={FadeInDown.delay(100).duration(350)} style={styles.fullNote}>
                  <Icon name="check" size={18} color={COLORS.success} strokeWidth={2.4} />
                  <Text style={styles.fullNoteText}>
                    You've used all {MAX_PHOTOS} slots. Delete one in the gallery
                    to swap in a better shot.
                  </Text>
                </Animated.View>
              )}
            </>
          )}
        </ScrollView>

        {justUploaded === 0 && slotsLeft > 0 && (
          <View style={styles.footer}>
            <Button
              label={
                picked.length > 0
                  ? `Upload ${picked.length} ${picked.length === 1 ? 'photo' : 'photos'}`
                  : 'Pick photos to upload'
              }
              onPress={handleUpload}
              loading={uploading}
              disabled={picked.length === 0}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 18, paddingTop: 8, gap: 18, paddingBottom: 24 },
  completeWrap: { paddingTop: 60, alignItems: 'center' },
  completeActions: { marginTop: 14, gap: 12, alignSelf: 'stretch' },
  addMore: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: COLORS.primary,
    textAlign: 'center',
  },
  stakeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.primaryTint,
    borderWidth: 1,
    borderColor: 'rgba(255,94,91,0.25)',
    borderRadius: 16,
    padding: 14,
  },
  stakeText: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.textPrimary,
  },
  sectionLabel: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    letterSpacing: 0.3,
    color: 'rgba(15,24,44,0.5)',
    marginBottom: 8,
  },
  mineRow: { flexDirection: 'row', gap: 8 },
  mineTile: {
    width: 76,
    height: 76,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: COLORS.primaryTint,
  },
  mineImage: { width: '100%', height: '100%' },
  mineLikes: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    height: 19,
    borderRadius: 100,
    backgroundColor: 'rgba(15,24,44,0.55)',
  },
  mineLikesText: { fontFamily: FONTS.bold, fontSize: 10, color: '#fff' },
  captionInput: {
    minHeight: 64,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 13,
    fontFamily: FONTS.semibold,
    fontSize: 14.5,
    color: COLORS.textPrimary,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tagHint: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: -4,
    marginBottom: 10,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 6,
    paddingRight: 12,
    height: 36,
    borderRadius: 100,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tagChipOn: {
    backgroundColor: COLORS.primaryTint,
    borderColor: 'rgba(255,94,91,0.4)',
  },
  tagText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: 'rgba(15,24,44,0.7)',
  },
  tagTextOn: { color: COLORS.primary },
  fullNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(31,164,99,0.09)',
    borderRadius: 14,
    padding: 14,
  },
  fullNoteText: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(15,24,44,0.65)',
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: COLORS.background,
  },
});
