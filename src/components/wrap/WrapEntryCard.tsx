import { View, Text, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon, PressableScale } from '@/components/ui';
import { useWrap, useWrapEntry, wrapStepsDone, wrapStepTotal } from '@/hooks/useWrap';

// "Wrap up last night" banner for Home and Explore. Shows the most recently
// ended attended event still inside its wrap window; hides itself when the
// checklist is complete or there's nothing to wrap.
export default function WrapEntryCard({ style }: { style?: object }) {
  const router = useRouter();
  const { data: event } = useWrapEntry();
  const { status } = useWrap(event?.id);

  if (!event || !status) return null;

  const done = wrapStepsDone(status);
  const total = wrapStepTotal(status);
  if (done >= total) return null;

  return (
    <Animated.View entering={FadeInDown.duration(350)} style={style}>
      <PressableScale
        scaleTo={0.98}
        style={styles.card}
        onPress={() => router.push(`/events/wrap/${event.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Wrap up ${event.title}`}
      >
        <View style={styles.iconTile}>
          <Icon name="camera" size={21} color={COLORS.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            Wrap up {event.title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {done}/{total} done · rate people, drop photos, vote awards
          </Text>
        </View>
        <View style={styles.progressPill}>
          <Text style={styles.progressText}>
            {done}/{total}
          </Text>
        </View>
        <Icon name="chevronRight" size={18} color="rgba(15,24,44,0.35)" />
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    backgroundColor: COLORS.primaryTint,
    borderWidth: 1,
    borderColor: 'rgba(255,94,91,0.25)',
    borderRadius: RADIUS.xl,
    padding: SPACING[3.5],
  },
  iconTile: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.bodyMd,
    letterSpacing: -0.29,
    color: COLORS.textPrimary,
  },
  sub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  progressPill: {
    paddingHorizontal: SPACING[2],
    height: 24,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: { fontFamily: FONTS.heavy, fontSize: TYPE_SIZE.micro, color: '#fff' },
});
