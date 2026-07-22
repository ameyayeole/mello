import { StyleSheet } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { SPACING } from '@/constants/spacing';
import { Profile } from '@/types/models';
import { Avatar, PressableScale } from '@/components/ui';

// The row of tiny faces under your own message: everyone whose "read up to"
// has passed it. Instagram's read receipt, and the reason it's a rail rather
// than a label is that in a group the faces spread down the thread and you can
// see at a glance who is where.

const FACE = 16;

// Past this the rail is wider than the meta row it sits in, so the rest become
// a count in the sheet instead.
const MAX_FACES = 4;

export default function ReadRail({
  readers,
  alignRight,
  onPress,
}: {
  readers: Profile[];
  alignRight?: boolean;
  onPress?: () => void;
}) {
  if (readers.length === 0) return null;
  const shown = readers.slice(0, MAX_FACES);

  return (
    <PressableScale
      scaleTo={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        readers.length === 1
          ? `Read by ${readers[0].name}. Tap for details`
          : `Read by ${readers.length} people. Tap for details`
      }
      style={[styles.rail, alignRight ? styles.right : styles.left]}
    >
      {shown.map((reader) => (
        <Animated.View
          key={reader.id}
          entering={ZoomIn.duration(220)}
          exiting={ZoomOut.duration(140)}
        >
          <Avatar name={reader.name} photoUrl={reader.photo_url} size={FACE} />
        </Animated.View>
      ))}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    gap: SPACING[0.5],
    marginTop: SPACING[0.5],
  },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
});
