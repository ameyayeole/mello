import { memo } from 'react';
import { Text,
  View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Avatar, Button, Icon, PressableScale } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useCreateEventStore } from '@/stores/createEventStore';
import { GLYPH_STROKE, TAP_SCALE } from '../motion';
import { StepShell } from '../StepShell';
import { themedStyles } from '@/theme';

// Step 3 — the cover photo, which is optional.
export const StepPhoto = memo(function StepPhoto() {
  const user = useAuthStore((s) => s.user);
  const photoUri = useCreateEventStore((s) => s.photoUri);
  const setPhotoUri = useCreateEventStore((s) => s.setPhotoUri);

  async function pickPhoto() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  return (
    <StepShell>
      {photoUri ? (
        <View style={styles.photoWrap}>
          <Image
            source={{ uri: photoUri }}
            style={styles.photoPreview}
            contentFit="cover"
          />
          <PressableScale
            scaleTo={TAP_SCALE}
            style={styles.photoRemove}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPhotoUri(null);
            }}
            accessibilityLabel="Remove photo"
          >
            <Icon name="close" size={14} color={COLORS.white} strokeWidth={2.5} />
          </PressableScale>
        </View>
      ) : null}
      {/* The X on the corner removes; swapping one photo for another had meant
          removing first and then finding the picker again. This is the action
          people actually want after seeing the preview. */}
      {photoUri ? (
        <Button
          variant="tertiary"
          size="md"
          label="Replace photo"
          onPress={pickPhoto}
        />
      ) : null}
      {!photoUri ? (
        <PressableScale
          scaleTo={TAP_SCALE}
          style={styles.photoEmpty}
          onPress={pickPhoto}
          accessibilityRole="button"
          accessibilityLabel="Add a cover photo"
        >
          <View style={styles.photoEmptyIcon}>
            <Icon
              name="camera"
              size={22}
              color={COLORS.primary}
              strokeWidth={GLYPH_STROKE}
            />
          </View>
          <Text style={styles.photoEmptyTitle}>Choose a photo</Text>
          <Text style={styles.photoEmptySub}>
            Adding a photo increases the chances of people joining your event.
          </Text>
        </PressableScale>
      ) : null}
      {!photoUri && (
        <View style={styles.photoFallback}>
          <Avatar name={user?.name} photoUrl={user?.photo_url} size={34} />
          <Text style={styles.photoFallbackText}>
            If you skip this, we&apos;ll use your profile picture as the event
            photo.
          </Text>
        </View>
      )}
    </StepShell>
  );
});

const styles = themedStyles(() => ({
  photoWrap: {
    marginTop: SPACING[4],
    marginBottom: SPACING[3],
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  photoPreview: { width: '100%', height: 180 },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.glassOnPhoto,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmpty: {
    alignItems: 'center',
    gap: SPACING[1],
    marginTop: SPACING[4],
    paddingVertical: SPACING[7],
    paddingHorizontal: SPACING[7],
    borderRadius: RADIUS.xl,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  photoEmptyIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[2],
  },
  photoEmptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  photoEmptySub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 17,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  // Pinned to the bottom of the step area and run 24pt past it, so the Next
  // button (a later sibling, painted on top) covers the square bottom edge and
  // the notice reads as one tray tucked behind it.
  photoFallback: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    paddingHorizontal: SPACING[3],
    paddingTop: SPACING[3],
    paddingBottom: SPACING[8],
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: COLORS.inkFaint,
  },
  photoFallbackText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 17,
    color: COLORS.textSecondary,
  },
}));
