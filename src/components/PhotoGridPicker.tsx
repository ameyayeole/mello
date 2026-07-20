import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon } from '@/components/ui';

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
          <TouchableOpacity
            style={styles.remove}
            onPress={() => removeAt(i)}
            hitSlop={8}
          >
            <Text style={styles.removeText}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}
      {photos.length < max && (
        <TouchableOpacity
          style={[styles.slot, styles.addSlot]}
          onPress={addPhotos}
        >
          <View style={styles.addIcon}>
            <Icon name="plus" size={16} color={COLORS.primary} strokeWidth={2.2} />
          </View>
          <Text style={styles.addLabel}>Add photo</Text>
        </TouchableOpacity>
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
  addSlot: {
    borderWidth: 1.5,
    borderColor: 'rgba(15,24,44,0.2)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[1],
  },
  addIcon: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: 'rgba(15,24,44,0.5)',
  },
  mainBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING[2],
    paddingVertical: SPACING[0.5],
    borderRadius: RADIUS.full,
  },
  mainBadgeText: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.nano, color: '#fff' },
  remove: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: RADIUS.xs,
    backgroundColor: 'rgba(15,24,44,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: TYPE_SIZE.caption, fontWeight: '700', lineHeight: 14 },
});
