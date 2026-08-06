import { View } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { SkeletonBone } from '@/components/ui';
import { themedStyles } from '@/theme';

// A notification: the 46pt glyph circle, then the sentence and its timestamp.
// The sentence runs to two lines on most types, which is why the second bone is
// there even though it is the shorter one.
const GLYPH = 46;

export default function SkeletonNotifRow({ count = 7 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonBone circle size={GLYPH} />
          <View style={styles.text}>
            <SkeletonBone w={i % 2 ? '88%' : '70%'} h={12} />
            <SkeletonBone w={i % 3 ? '40%' : '56%'} h={10} />
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
    paddingVertical: SPACING[3.5],
    paddingLeft: SPACING[4],
    paddingRight: SPACING[3.5],
  },
  text: { flex: 1, gap: SPACING[2] },
}));
