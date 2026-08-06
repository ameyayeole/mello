import { View } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { SkeletonBone } from '@/components/ui';
import { themedStyles } from '@/theme';

// A thread mid-fetch: bubbles alternating sides at varied widths.
//
// The widths are a fixed repeating pattern rather than random. Random reads
// better for exactly one render and then differs every time the component
// remounts — a list that reshuffles itself while you look at it. Fixed also
// means the skeleton's height is the same on every open, which is what keeps
// the crossfade from shifting the thread.
const WIDTHS = ['60%', '85%', '45%', '70%', '52%', '78%'] as const;
const HEIGHTS = [38, 58, 38, 48, 38, 58] as const;

export default function SkeletonBubble({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.thread}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[styles.row, i % 2 === 1 && styles.rowMine]}
        >
          <SkeletonBone
            w={WIDTHS[i % WIDTHS.length]}
            h={HEIGHTS[i % HEIGHTS.length]}
            radius={RADIUS['2xl']}
          />
        </View>
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  // Reversed, because the threads it stands in for are `inverted` lists — the
  // newest message sits at the bottom. Laying the skeleton out top-down would
  // bunch the bones at the top of an empty screen.
  thread: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: SPACING[2],
    padding: SPACING[4],
  },
  row: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
}));
