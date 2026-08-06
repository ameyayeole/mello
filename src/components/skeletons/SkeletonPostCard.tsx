import { View } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { Glass, SkeletonBone } from '@/components/ui';
import { themedStyles } from '@/theme';

// A community post: author row, a media block, two lines of body, the action
// bar. Used by the feed, the post detail screen and a profile's posts — the
// last two being where it also fixes a *bug*, not just a spinner: both branched
// on `length === 0` and flashed "No posts yet." at people who have posts.
//
// Every third card skips the media block. A feed of identical cards reads as a
// pattern rather than as posts, and a text-only post is common enough that a
// skeleton which always promises a photo is lying about what is coming.
export default function SkeletonPostCard({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <Glass
          key={i}
          tier="panel"
          radius={RADIUS['2xl']}
          style={styles.card}
        >
          <View style={styles.author}>
            <SkeletonBone circle size={38} />
            <View style={styles.authorText}>
              <SkeletonBone w={110} h={12} />
              <SkeletonBone w={72} h={10} />
            </View>
          </View>

          {i % 3 !== 2 && (
            <SkeletonBone w="100%" h={190} radius={RADIUS.lg} style={styles.media} />
          )}

          <View style={styles.body}>
            <SkeletonBone w="92%" h={11} />
            <SkeletonBone w={i % 2 ? '64%' : '78%'} h={11} />
          </View>

          <View style={styles.actions}>
            <SkeletonBone w={44} h={14} />
            <SkeletonBone w={44} h={14} />
            <SkeletonBone w={28} h={14} />
          </View>
        </Glass>
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  list: { gap: SPACING[3.5] },
  card: { padding: SPACING[4], gap: SPACING[3] },
  author: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  authorText: { gap: SPACING[1.5] },
  media: { marginTop: SPACING[1] },
  body: { gap: SPACING[2] },
  actions: { flexDirection: 'row', gap: SPACING[5], marginTop: SPACING[1] },
}));
