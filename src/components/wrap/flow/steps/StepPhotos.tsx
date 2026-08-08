import { memo, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import { pickPhotos } from '@/components/PhotoGridPicker';
import { PhotoCarousel } from '@/components/wrap/PhotoCarousel';
import { CompleteMoment } from '@/components/wrap/CompleteMoment';
import { useWrapGallery } from '@/hooks/useWrapGallery';
import { useWrap } from '@/hooks/useWrap';
import { getCoAttendees, addWrapPhoto } from '@/services/wrap.service';
import { uploadWrapPhoto } from '@/services/storage.service';
import { useAuthStore } from '@/stores/authStore';
import { useWrapFlowStore } from '@/stores/wrapFlowStore';
import { COLORS, inkAlpha } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Avatar, Button, Icon, PressableScale } from '@/components/ui';
import { showError } from '@/utils/errors';
import { themedStyles } from '@/theme';

// Five slots, matching the carousel and the checklist's "Up to 5".
const MAX_PHOTOS = 5;

// Add your best photos to the pool. Caption + tags apply to this batch;
// the 6 most-liked photos of the event go public on Explore.
//
// No props — that is what lets memo hold this against the flow's re-renders.
// See AGENTS.md: adding a single prop undoes it with no error and no failing
// test, just the old behaviour back.
export const StepPhotos = memo(function StepPhotos() {
  const eventId = useWrapFlowStore((s) => s.eventId) ?? undefined;
  const next = useWrapFlowStore((s) => s.next);
  const index = useWrapFlowStore((s) => s.photoIndex);
  const setIndex = useWrapFlowStore((s) => s.setPhotoIndex);
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
  const slotsLeft = Math.max(0, MAX_PHOTOS - myPhotos.length - picked.length);

  // Already in the pool, then this batch, then empty frames to five. The
  // carousel always shows five slots so the shape of the step does not change
  // as you fill it.
  const slots = useMemo(() => {
    const filled: (string | null)[] = [
      ...myPhotos.map((p) => p.url),
      ...picked,
    ];
    while (filled.length < MAX_PHOTOS) filled.push(null);
    return filled.slice(0, MAX_PHOTOS);
  }, [myPhotos, picked]);

  const uploadedCount = myPhotos.length;

  async function handleSlotPress(i: number) {
    // An uploaded photo is already in the pool — deleting it is the gallery's
    // job, not a side effect of tapping it here.
    if (i < uploadedCount) return;
    const localIndex = i - uploadedCount;
    if (localIndex < picked.length) {
      setPicked((p) => p.filter((_, n) => n !== localIndex));
      return;
    }
    if (slotsLeft <= 0) return;
    setPicked(await pickPhotos(picked, MAX_PHOTOS - uploadedCount));
  }

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
      for (const uri of picked) {
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
      setIndex(0);
      photosQuery.refetch();
      invalidate();
    } catch (e) {
      showError(e, 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (justUploaded > 0) {
    return (
      <View style={styles.completeWrap}>
        <CompleteMoment
          title={justUploaded === 1 ? 'Photo in the pool!' : 'Photos in the pool!'}
          sub="Likes decide the top 6. May the best shots win."
        >
          <View style={styles.completeActions}>
            {/* Was "See the gallery" as a router.replace. Inside the flow the
                onward move is the next step — the gallery is still one tap away
                from the hub afterwards. */}
            <Button variant="tertiary" label="Continue" height={44} onPress={next} />
            {MAX_PHOTOS - myPhotos.length > 0 && (
              <PressableScale scaleTo={0.96} onPress={() => setJustUploaded(0)} hitSlop={8}>
                <Text style={styles.addMore}>
                  Add more ({MAX_PHOTOS - myPhotos.length} left)
                </Text>
              </PressableScale>
            )}
          </View>
        </CompleteMoment>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* The competition stake, announced up front */}
        <Animated.View entering={FadeInDown.duration(350)} style={styles.stakeBanner}>
          <Icon name="crown" size={18} color={COLORS.primary} strokeWidth={2} />
          <Text style={styles.stakeText}>
            The 6 most-liked photos go public on Explore as the event&apos;s
            official wrap. Friendly competition, bring your best.
          </Text>
        </Animated.View>

        <View style={styles.carouselWrap}>
          <PhotoCarousel
            uris={slots}
            index={index}
            onIndexChange={setIndex}
            onPick={handleSlotPress}
          />
        </View>

        <Text style={styles.carouselHint}>
          {index < uploadedCount
            ? 'Already in the pool. Swap it out from the gallery.'
            : slots[index]
              ? 'Tap to remove · swipe for the next slot'
              : 'Tap the frame to pick a photo'}
        </Text>

        <Animated.View entering={FadeInDown.delay(140).duration(350)}>
          <Text style={styles.sectionLabel}>CAPTION (OPTIONAL)</Text>
          <TextInput
            style={styles.captionInput}
            placeholder="That golden hour though…"
            placeholderTextColor={inkAlpha(0.40)}
            value={caption}
            onChangeText={(t) => setCaption(t.slice(0, 300))}
            multiline
          />
        </Animated.View>

        {(attendeesQuery.data?.length ?? 0) > 0 && (
          <Animated.View entering={FadeInDown.delay(180).duration(350)}>
            <Text style={styles.sectionLabel}>TAG WHO&apos;S IN THEM</Text>
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
      </ScrollView>

      {/* The standalone screen's footer only ever uploaded, because leaving was
          the header's job. A step has to hand over to the next one, so once you
          have a photo in the pool the same button becomes the way forward. */}
      <View style={styles.footer}>
        {picked.length > 0 || myPhotos.length === 0 ? (
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
        ) : (
          <Button label="Continue" onPress={next} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
});

const styles = themedStyles(() => ({
  scroll: { padding: SPACING[4], paddingTop: SPACING[2], gap: SPACING[4], paddingBottom: SPACING[6] },
  completeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  completeActions: { marginTop: SPACING[3.5], gap: SPACING[3], alignSelf: 'stretch' },
  addMore: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.primary,
    textAlign: 'center',
  },
  stakeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING[2.5],
    backgroundColor: COLORS.primaryTint,
    borderWidth: 1,
    borderColor: 'rgba(255,94,91,0.25)',
    borderRadius: RADIUS.lg,
    padding: SPACING[3.5],
  },
  stakeText: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 18,
    color: COLORS.textPrimary,
  },
  // The carousel is centre-locked and wider than the scroll's padding, so it
  // bleeds to the screen edges — that is what lets the next frame peek.
  carouselWrap: { marginHorizontal: -SPACING[4] },
  carouselHint: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: -SPACING[2],
  },
  sectionLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    letterSpacing: 0.3,
    color: inkAlpha(0.5),
    marginBottom: SPACING[2],
  },
  captionInput: {
    minHeight: 64,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING[3],
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tagHint: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
    marginTop: -4,
    marginBottom: SPACING[2.5],
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[2] },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    paddingLeft: SPACING[1.5],
    paddingRight: SPACING[3],
    height: 36,
    borderRadius: RADIUS.full,
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
    fontSize: TYPE_SIZE.bodySm,
    color: inkAlpha(0.7),
  },
  tagTextOn: { color: COLORS.primary },
  footer: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[2.5],
    paddingBottom: SPACING[2.5],
    backgroundColor: COLORS.background,
  },
}));
