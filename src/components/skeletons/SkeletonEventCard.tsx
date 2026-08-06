import { View } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { SkeletonBone } from '@/components/ui';
import { themedStyles } from '@/theme';

// A saved event in the wishlist: the 64pt media tile with title and time beside
// it, the location line, the host row, then the divider and the footer.
//
// A solid card rather than glass, because the real `WishlistCard` is one —
// `COLORS.surface` with the same radius and shadow. A frosted skeleton under a
// solid card is the same swap-visible mistake as the chats sheet, in reverse.
const TILE = 64;

export default function SkeletonEventCard({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.top}>
            <SkeletonBone w={TILE} h={TILE} radius={RADIUS.lg} />
            <View style={styles.heading}>
              <SkeletonBone w={i % 2 ? '72%' : '58%'} h={14} />
              <SkeletonBone w="44%" h={11} />
            </View>
            <SkeletonBone circle size={22} />
          </View>

          <SkeletonBone w="52%" h={11} />

          <View style={styles.host}>
            <SkeletonBone circle size={38} />
            <View style={styles.hostText}>
              <SkeletonBone w={54} h={9} />
              <SkeletonBone w={96} h={12} />
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.footer}>
            <SkeletonBone w={72} h={12} />
            <View style={styles.spacer} />
            <SkeletonBone w={88} h={40} radius={RADIUS.sm} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  list: { gap: SPACING[3.5] },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS['2xl'],
    padding: SPACING[4],
    gap: SPACING[2.5],
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3] },
  heading: { flex: 1, gap: SPACING[2] },
  host: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  hostText: { gap: SPACING[1.5] },
  divider: { height: 1, backgroundColor: COLORS.borderSoft },
  footer: { flexDirection: 'row', alignItems: 'center' },
  spacer: { flex: 1 },
}));
