import { View } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { Glass, SkeletonBone } from '@/components/ui';
import { themedStyles } from '@/theme';
import { StyleSheet } from 'react-native';

// The Inbox list, mid-fetch.
//
// **Inside the real `Glass` sheet, not next to it.** The chats list puts every
// row on one continuous frosted panel divided by inset hairlines; a skeleton
// that skipped the panel would have the panel itself appear at the swap, which
// is a bigger movement than the rows arriving.
//
// The thumb is the row's real 52pt and the dividers are inset by the same
// `SPACING[3] + 52 + SPACING[3]`, so the sheet is exactly as tall before the
// content lands as after.
const THUMB = 52;

export default function SkeletonChatRow({ count = 6 }: { count?: number }) {
  return (
    <Glass tier="panel" radius={RADIUS['2xl']} style={styles.sheet}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          {i > 0 && <View style={styles.divider} />}
          <SkeletonBone w={THUMB} h={THUMB} radius={RADIUS.lg} />
          <View style={styles.info}>
            <SkeletonBone w={i % 3 === 0 ? '46%' : '62%'} h={13} />
            <SkeletonBone w={i % 2 ? '72%' : '54%'} h={11} />
          </View>
          <SkeletonBone w={34} h={10} />
        </View>
      ))}
    </Glass>
  );
}

const styles = themedStyles(() => ({
  sheet: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2.5],
  },
  divider: {
    position: 'absolute',
    top: 0,
    left: SPACING[3] + THUMB + SPACING[3],
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: COLORS.border,
  },
  info: { flex: 1, minWidth: 0, gap: SPACING[2] },
}));
