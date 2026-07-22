import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { COLORS } from '@/constants/colors';
import { Profile } from '@/types/models';
import { Avatar } from './Avatar';

/** Just enough of a person to draw their bubble. */
export type Attendee = Pick<Profile, 'id' | 'name' | 'photo_url'>;

// Overlapping attendee bubbles: the first few faces, then a +N counter.
//
// `people` are real profiles — photo, or their initial on the brand gradient
// when they have none. An earlier version took only a count and drew flat
// pastel discs, which at small sizes read as a status dot rather than as
// people; the whole point of the stack is that you recognise a face in it.
//
// `count` is the *total* going, which is not the same as `people.length`: a
// feed may know that eleven people are going while only carrying three of them.
// It defaults to the number of people supplied.
export function AttendeeStack({
  people = [],
  count = people.length,
  max = 3,
  size = 27,
  ring = true,
  ringColor = COLORS.white,
  ringWidth = 1.5,
  emptyLabel = 'Be the first to join',
  style,
}: {
  people?: Attendee[];
  count?: number;
  max?: number;
  size?: number;
  ring?: boolean;
  ringColor?: string;
  ringWidth?: number;
  emptyLabel?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  // Nobody going yet: a prompt rather than an empty gap, so a brand-new event
  // doesn't look broken.
  if (count <= 0) {
    return emptyLabel ? <Text style={styles.empty}>{emptyLabel}</Text> : null;
  }

  const faces = people.slice(0, max);
  // Everyone we did not draw — including people the caller knows about but did
  // not hand us.
  const overflow = count - faces.length;
  // With no faces at all the chip is not an overflow, it is the whole count, so
  // it reads "3" rather than "+3". A "+3" with nothing to add to is a bug on
  // its face. This is the state a feed lands in when it knows how many are
  // going but not who they are.
  const prefix = faces.length > 0 ? '+' : '';
  const radius = size / 2;

  return (
    <View style={[styles.row, style]}>
      {faces.map((person, i) => (
        <View key={person.id} style={i === 0 ? null : styles.overlap}>
          <Avatar
            name={person.name}
            photoUrl={person.photo_url}
            size={size}
            ringColor={ring ? ringColor : undefined}
            ringWidth={ringWidth}
          />
        </View>
      ))}
      {overflow > 0 && (
        <View
          style={[
            styles.overflow,
            { width: size, height: size, borderRadius: radius },
            faces.length > 0 && styles.overlap,
            ring ? { borderWidth: ringWidth, borderColor: ringColor } : null,
          ]}
        >
          <Text style={styles.overflowText}>
            {prefix}
            {overflow}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // Each bubble tucks under the one before it. Not applied to the first.
  overlap: { marginLeft: -9 },
  overflow: {
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowText: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.nano,
    color: COLORS.white,
  },
  empty: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
  },
});
