import { memo } from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { useWrap } from '@/hooks/useWrap';
import { useWrapFlowStore } from '@/stores/wrapFlowStore';
import { Button, Icon } from '@/components/ui';
import { themedStyles } from '@/theme';

// Would you do this again? One tap, and the tally is public.
//
// `encore_requests_select` is USING (is_event_attendee(...))
// (032_wrap.sql:464) — every attendee can already read this table, user_id
// included, and the hub shows the tally. The count is not a leak, it is the
// point. NEVER describe this step as private.
//
// No props — see AGENTS.md.
export const StepRewind = memo(function StepRewind() {
  const eventId = useWrapFlowStore((s) => s.eventId) ?? undefined;
  const next = useWrapFlowStore((s) => s.next);
  const { status, encore } = useWrap(eventId);

  function runItBack() {
    encore.mutate(true);
    next();
  }

  return (
    <View style={styles.wrap}>
      <Animated.View entering={FadeInDown.duration(320)} style={styles.body}>
        <View style={styles.glyph}>
          <Icon name="rewind" size={38} color={COLORS.primary} strokeWidth={2} />
        </View>
        <Text style={styles.title}>Run it back?</Text>
        <Text style={styles.sub}>
          Tell the host you&apos;d do this again. Everyone who came can see the
          count.
        </Text>
        <Text style={styles.count}>
          {status?.encoreCount
            ? `${status.encoreCount} ${
                status.encoreCount === 1 ? 'person wants' : 'people want'
              } to run it back`
            : 'Be the first to run it back'}
        </Text>
      </Animated.View>

      <View style={styles.footer}>
        <Button
          label={status?.encoreRequested ? "You're in — continue" : "I'd do it again"}
          onPress={status?.encoreRequested ? next : runItBack}
        />
        <Button variant="tertiary" label="Skip" onPress={next} />
      </View>
    </View>
  );
});

const styles = themedStyles(() => ({
  wrap: { flex: 1, justifyContent: 'space-between' },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[6],
  },
  glyph: {
    width: 84,
    height: 84,
    borderRadius: RADIUS['3xl'],
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[2],
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.titleLg,
    letterSpacing: -0.48,
    color: COLORS.textPrimary,
  },
  sub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  count: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.primary,
    marginTop: SPACING[2],
  },
  footer: {
    padding: SPACING[4],
    gap: SPACING[2],
  },
}));
