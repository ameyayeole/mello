import { View,
  Text } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS, inkAlpha } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon, PressableScale } from '@/components/ui';
import { useWrap, useWrapEntry, wrapStepsDone, wrapStepTotal } from '@/hooks/useWrap';
import { wrapGateState } from '@/utils/wrapGate';
import { themedStyles } from '@/theme';

// "Wrap up last night" banner for Home and Explore. Shows the most recently
// ended attended event still inside its wrap window.
export default function WrapEntryCard({ style }: { style?: object }) {
  const router = useRouter();
  const { data: event } = useWrapEntry();
  const { status } = useWrap(event?.id);

  if (!event || !status) return null;

  const done = wrapStepsDone(status);
  const total = wrapStepTotal(status);
  const mine = done >= total;

  // Gone when the wrap is actually open to you — not merely when your own
  // checklist is clear. Under the old rule (`done >= total`), the one person
  // who finished first lost their way back to a wrap that had not opened yet.
  if (mine && wrapGateState(status) === 'open') return null;

  // Past 48h the row stops being a summons and becomes a way back in. The row
  // itself stays for seven days — getLatestWrappableEvent's window, unchanged.
  const past = (status.hoursSinceEnd ?? 0) >= 48;
  const title = past ? `View the ${event.title} wrap` : 'Wrap it up';

  // Once your own steps are done that count has nothing left to say, so the
  // line switches to what everyone else is doing.
  const sub = mine
    ? `${status.contributorCount} of ${status.contributorsNeeded} contributed`
    : `${done}/${total} done · rate people, drop photos, vote awards`;

  return (
    <Animated.View entering={FadeInDown.duration(350)} style={style}>
      <PressableScale
        scaleTo={0.98}
        style={styles.card}
        // An unfinished wrap goes to the flow — only the flow writes the
        // contributor marker. A finished one goes to the hub, where the gallery,
        // the encore and the recap are.
        onPress={() =>
          router.push(
            mine
              ? `/events/wrap/${event.id}`
              : `/events/wrap/flow/${event.id}`
          )
        }
        accessibilityRole="button"
        accessibilityLabel={`${title} — ${event.title}`}
      >
        <View style={styles.iconTile}>
          <Icon name="camera" size={21} color={COLORS.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {!mine && (
          <View style={styles.progressPill}>
            <Text style={styles.progressText}>
              {done}/{total}
            </Text>
          </View>
        )}
        <Icon name="chevronRight" size={18} color={inkAlpha(0.35)} />
      </PressableScale>
    </Animated.View>
  );
}

const styles = themedStyles(() => ({
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
}));
