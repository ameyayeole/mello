import { View, Text, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { Image } from 'expo-image';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon, PressableScale } from '@/components/ui';
import { WrapPhoto } from '@/types/models';

// Grid tile in the wrap gallery: photo + like count, with a chip when the
// viewer is tagged in it.
export default function WrapPhotoTile({
  photo,
  mentioned,
  onPress,
}: {
  photo: WrapPhoto;
  mentioned?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      scaleTo={0.97}
      style={styles.tile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open photo"
    >
      <Image source={{ uri: photo.url }} style={styles.image} contentFit="cover" transition={150} />
      <View style={styles.likePill}>
        <Icon name="heart" size={11} color="#fff" strokeWidth={2.4} />
        <Text style={styles.likeText}>{photo.like_count}</Text>
      </View>
      {mentioned && (
        <View style={styles.mentionChip}>
          <Text style={styles.mentionText}>You're in this</Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.primaryTint,
  },
  image: { width: '100%', height: '100%' },
  likePill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    paddingHorizontal: SPACING[2],
    height: 24,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(15,24,44,0.55)',
  },
  likeText: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.micro, color: '#fff' },
  mentionChip: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: SPACING[2],
    height: 22,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mentionText: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.nano, color: '#fff' },
});
