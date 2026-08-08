import { memo, useMemo, useState } from 'react';
import {
  Alert,
  View,
  Text,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { RADIUS, SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import { pickPhotos } from '@/components/PhotoGridPicker';
import { PhotoCarousel } from '@/components/wrap/PhotoCarousel';
import { CompleteMoment } from '@/components/wrap/CompleteMoment';
import { useWrapGallery } from '@/hooks/useWrapGallery';
import { useWrap } from '@/hooks/useWrap';
import {
  getCoAttendees,
  addWrapPhoto,
  deleteWrapPhoto,
} from '@/services/wrap.service';
import { uploadWrapPhoto } from '@/services/storage.service';
import { useAuthStore } from '@/stores/authStore';
import { useWrapFlowStore } from '@/stores/wrapFlowStore';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Avatar, Button, Glass, Icon, PressableScale } from '@/components/ui';
import { showError } from '@/utils/errors';
import { themedStyles } from '@/theme';

// Must match `enforce_photo_cap()` (migration 080). The cap is enforced by a
// BEFORE INSERT trigger, so a client number higher than the server's does not
// raise the limit — it just moves the failure to mid-upload, after some photos
// have already landed.
const MAX_PHOTOS = 6;

// One picked photo and the caption and tags that belong to *it*.
//
// Caption and tags used to be one pair applied to the whole batch, which meant
// four photos of four different people all carried the same words and tagged
// the same person. They travel with the photo now.
interface Draft {
  uri: string;
  caption: string;
  tagged: string[];
}

// The photo IS the step. It fills the frame and the caption and tags float on
// it in `onPhoto` glass, rather than sitting in a card with form fields stacked
// underneath — which is what made this read as a form about a photo instead of
// the photo itself.
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

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [justUploaded, setJustUploaded] = useState(0);
  const [heroH, setHeroH] = useState(0);

  const attendeesQuery = useQuery({
    queryKey: queryKeys.wrapAttendees.of(eventId, user?.id),
    queryFn: () => getCoAttendees(eventId!, user!.id),
    enabled: !!eventId && !!user,
  });

  const myPhotos = useMemo(
    () => sortedPhotos.filter((p) => p.uploader_id === user?.id),
    [sortedPhotos, user?.id]
  );
  const slotsLeft = Math.max(0, MAX_PHOTOS - myPhotos.length - drafts.length);

  // Already in the pool first, then the ones being added. No empty frames: a
  // placeholder you tap to open a picker made the strip mostly furniture, and
  // there is a button for that.
  const slots = useMemo(
    () => [...myPhotos.map((p) => p.url), ...drafts.map((d) => d.uri)],
    [myPhotos, drafts]
  );
  const uploadedCount = myPhotos.length;

  const safeIndex = slots.length ? Math.min(index, slots.length - 1) : 0;
  const draftIndex = safeIndex - uploadedCount;
  const draft: Draft | undefined = drafts[draftIndex];

  async function addPhotos() {
    if (slotsLeft <= 0) return;
    const uris = await pickPhotos(
      drafts.map((d) => d.uri),
      MAX_PHOTOS - uploadedCount
    );
    const added = uris
      .filter((uri) => !drafts.some((d) => d.uri === uri))
      .map((uri) => ({ uri, caption: '', tagged: [] as string[] }));
    if (added.length === 0) return;
    setDrafts((d) => [...d, ...added]);
    // Land on the first one just added, so the strip comes across to what you
    // picked rather than leaving you to find it.
    setIndex(uploadedCount + drafts.length);
  }

  function patchDraft(patch: Partial<Draft>) {
    if (draftIndex < 0) return;
    setDrafts((d) =>
      d.map((item, i) => (i === draftIndex ? { ...item, ...patch } : item))
    );
  }

  function toggleTag(id: string) {
    if (!draft) return;
    const on = draft.tagged.includes(id);
    patchDraft({
      tagged: on ? draft.tagged.filter((t) => t !== id) : [...draft.tagged, id],
    });
  }

  function removeAt(i: number) {
    // An already-uploaded photo leaves the pool for everyone, so it asks first —
    // the same confirmation the gallery uses for the same action.
    if (i < uploadedCount) {
      const photo = myPhotos[i];
      Alert.alert('Delete photo?', 'It leaves the pool for everyone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWrapPhoto(photo.id);
              setIndex(Math.max(0, i - 1));
              photosQuery.refetch();
              invalidate();
            } catch (e) {
              showError(e);
            }
          },
        },
      ]);
      return;
    }
    const at = i - uploadedCount;
    setDrafts((d) => d.filter((_, n) => n !== at));
    setIndex(Math.max(0, i - 1));
  }

  async function handleUpload() {
    if (!user || !eventId || drafts.length === 0) return;
    try {
      setUploading(true);
      for (const d of drafts) {
        const url = await uploadWrapPhoto(user.id, eventId, d.uri);
        await addWrapPhoto({
          eventId,
          uploaderId: user.id,
          url,
          caption: d.caption,
          mentions: d.tagged,
        });
      }
      setJustUploaded(drafts.length);
      setDrafts([]);
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
          sub="Everyone who came can see them."
        >
          <View style={styles.completeActions}>
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

  if (slots.length === 0) {
    return (
      <View style={styles.emptyRoot}>
        <View style={styles.empty}>
          <View style={styles.emptyGlyph}>
            <Icon name="galleryAdd" size={38} color={COLORS.primary} />
          </View>
          <Text style={styles.heroTitle}>What did the night look like?</Text>
          <Text style={styles.heroSub}>
            Up to {MAX_PHOTOS}. Each one gets its own words.
          </Text>
        </View>
        <View style={styles.footer}>
          <Button label="Add photos" icon="galleryAdd" onPress={addPhotos} />
          <Button variant="tertiary" label="Skip for now" onPress={next} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <View
        style={styles.hero}
        onLayout={(e) => setHeroH(e.nativeEvent.layout.height)}
      >
        {heroH > 0 && (
          <PhotoCarousel
            uris={slots}
            index={safeIndex}
            onIndexChange={setIndex}
            onDelete={removeAt}
            // Nearly full-bleed. The last sliver of the neighbour is the only
            // thing telling you there is another photo, so it stays.
            widthRatio={0.9}
            height={heroH}
          />
        )}

        {/* Caption and tags sit OUTSIDE the carousel's track on purpose — inside
            it, a text field would pan away with the photo while you were typing
            in it. They read the centred index instead. */}
        <View style={styles.overlay} pointerEvents="box-none">
          {draft ? (
            <Glass tier="onPhoto" radius={RADIUS.xl} style={styles.captionGlass}>
              <TextInput
                style={styles.captionInput}
                placeholder="Say something about this one…"
                placeholderTextColor="rgba(255,255,255,0.6)"
                value={draft.caption}
                onChangeText={(t) => patchDraft({ caption: t.slice(0, 300) })}
                multiline
              />
            </Glass>
          ) : (
            <Glass tier="onPhoto" radius={RADIUS.xl} style={styles.captionGlass}>
              <Text style={styles.poolNoteText}>
                Already in the pool — its words are set.
              </Text>
            </Glass>
          )}

          {draft && (attendeesQuery.data?.length ?? 0) > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tagRow}
              keyboardShouldPersistTaps="handled"
            >
              {(attendeesQuery.data ?? []).map((a) => {
                const on = draft.tagged.includes(a.id);
                return (
                  <Glass
                    key={a.id}
                    tier="onPhoto"
                    radius={RADIUS.full}
                    shadow={false}
                    style={on ? styles.tagChipOn : undefined}
                  >
                    <PressableScale
                      scaleTo={0.95}
                      style={styles.tagChip}
                      onPress={() => toggleTag(a.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Tag ${a.name} in this photo`}
                    >
                      <Avatar name={a.name} photoUrl={a.photo_url} size={22} />
                      <Text style={styles.tagText}>{a.name.split(' ')[0]}</Text>
                      {on && (
                        <Icon name="check" size={13} color={COLORS.white} strokeWidth={2.8} />
                      )}
                    </PressableScale>
                  </Glass>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Which of yours you are looking at. Dots rather than "2 of 3": at six
            photos a counter is a number to read, dots are a glance. */}
        {slots.length > 1 && (
          <View style={styles.dots} pointerEvents="none">
            {slots.map((_, i) => (
              <View key={i} style={[styles.dot, i === safeIndex && styles.dotOn]} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        {slotsLeft > 0 && (
          <Button
            variant="tertiary"
            label={`Add more (${slotsLeft} left)`}
            icon="galleryAdd"
            onPress={addPhotos}
          />
        )}
        {drafts.length > 0 ? (
          <Button
            label={`Upload ${drafts.length} ${drafts.length === 1 ? 'photo' : 'photos'}`}
            onPress={handleUpload}
            loading={uploading}
          />
        ) : (
          <Button label="Continue" onPress={next} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
});

const styles = themedStyles(() => ({
  hero: { flex: 1, justifyContent: 'center' },
  overlay: {
    position: 'absolute',
    left: SPACING[6],
    right: SPACING[6],
    bottom: SPACING[4],
    gap: SPACING[2.5],
  },
  captionGlass: { paddingHorizontal: SPACING[3.5], paddingVertical: SPACING[1] },
  captionInput: {
    minHeight: 46,
    maxHeight: 96,
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.white,
    textAlignVertical: 'center',
  },
  poolNoteText: {
    paddingVertical: SPACING[3],
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.white,
    textAlign: 'center',
  },
  tagRow: { gap: SPACING[2], paddingRight: SPACING[2] },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    paddingLeft: SPACING[1.5],
    paddingRight: SPACING[3],
    height: 36,
  },
  tagChipOn: { borderColor: COLORS.white },
  tagText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.white,
  },
  dots: {
    position: 'absolute',
    top: SPACING[3],
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING[1.5],
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotOn: { backgroundColor: COLORS.white },

  emptyRoot: { flex: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[6],
  },
  emptyGlyph: {
    width: 96,
    height: 96,
    borderRadius: RADIUS['3xl'],
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  heroTitle: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.display,
    letterSpacing: -0.6,
    lineHeight: 38,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  heroSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.body,
    lineHeight: 22,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  completeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  completeActions: { marginTop: SPACING[3.5], gap: SPACING[3], alignSelf: 'stretch' },
  addMore: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.primary,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[2.5],
    paddingBottom: SPACING[2.5],
    gap: SPACING[2],
  },
}));
