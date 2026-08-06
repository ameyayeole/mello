import { View } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { SkeletonBone } from '@/components/ui';
import { themedStyles } from '@/theme';

// Avatar + name + subtitle: the shape behind friends, blocked, attendees,
// search results and the comment sheet.
//
// Geometry comes from the same `SPACING` tokens the real rows use rather than
// from literals, so a change to a row's padding at least has a chance of being
// followed here. It is not automatic — see the shape-drift note in the spec.
const AVATAR = 44;

export default function SkeletonPersonRow({
  count = 6,
  onDark = false,
}: {
  count?: number;
  // Passed straight through — see the note on `SkeletonBone`'s own prop.
  onDark?: boolean;
}) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonBone circle size={AVATAR} onDark={onDark} />
          <View style={styles.text}>
            {/* Two widths, not one: a column of identical bars reads as a table
                rather than as names. */}
            <SkeletonBone w={i % 2 ? '52%' : '38%'} h={13} onDark={onDark} />
            <SkeletonBone w={i % 2 ? '34%' : '46%'} h={11} onDark={onDark} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  list: { gap: SPACING[1] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2.5],
  },
  text: { flex: 1, gap: SPACING[2] },
}));
