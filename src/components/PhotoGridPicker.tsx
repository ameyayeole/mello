import { View, Text, StyleSheet, Image } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon, PressableScale } from '@/components/ui';

interface Props {
  // Ordered list of photo URIs — a mix of remote URLs (already uploaded) and
  // local `file://` URIs (newly picked, not yet uploaded). The first is the main
  // photo (mirrored into the avatar on save).
  photos: string[];
  onChange: (photos: string[]) => void;
  max?: number;
}

export function PhotoGridPicker({ photos, onChange, max = 6 }: Props) {
  async function addPhotos() {
    const remaining = max - photos.length;
    if (remaining <= 0) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });
    if (result.canceled) return;
    const picked = result.assets.map((a) => a.uri);
    onChange([...photos, ...picked].slice(0, max));
  }

  function removeAt(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.grid}>
      {photos.map((uri, i) => (
        <View key={`${uri}-${i}`} style={styles.slot}>
          <Image source={{ uri }} style={styles.photo} />
          {i === 0 && (
            <View style={styles.mainBadge}>
              <Text style={styles.mainBadgeText}>Main</Text>
            </View>
          )}
          <PressableScale
            scaleTo={0.88}
            style={styles.remove}
            onPress={() => removeAt(i)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove photo ${i + 1}`}
          >
            {/* Was a literal "✕" character, whose glyph metrics don't centre in
                a 22pt box the way a stroked path does. */}
            <Icon name="close" size={12} color={COLORS.white} strokeWidth={2.6} />
          </PressableScale>
        </View>
      ))}
      {photos.length < max && (
        <PressableScale
          scaleTo={0.96}
          style={[styles.slot, styles.addSlot]}
          onPress={addPhotos}
          accessibilityRole="button"
          accessibilityLabel="Add photo"
        >
          <View style={styles.addIcon}>
            <Icon
              name="plus"
              size={16}
              color={COLORS.textSecondary}
              strokeWidth={2.2}
            />
          </View>
          <Text style={styles.addLabel}>Add</Text>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[2.5] },
  slot: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  photo: { width: '100%', height: '100%' },
  // A quiet empty slot rather than a dashed outline shouting for attention.
  // The dashed border plus a coral-tinted plus made the *absence* of a photo
  // the loudest thing in the section, and it sat next to the real photos as an
  // obviously different kind of object. Now it reads as the next empty slot in
  // the same grid: same radius, same footprint, one step down in contrast.
  addSlot: {
    backgroundColor: COLORS.inkFaint,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[1.5],
  },
  addIcon: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textSecondary,
  },
  // Black, not coral. This is a label saying which photo is the main one — it
  // marks a fact, it isn't a call to action, and coral is reserved for the one
  // real CTA on the screen.
  mainBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING[2],
    paddingVertical: SPACING[0.5],
    borderRadius: RADIUS.full,
  },
  mainBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.nano,
    color: COLORS.white,
  },
  remove: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.scrimOnPhoto,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
