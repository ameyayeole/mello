import { memo } from 'react';
import { View, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SPACING } from '@/constants/spacing';
import { queryKeys } from '@/constants/queryKeys';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { useWrap } from '@/hooks/useWrap';
import { useWrapFlowStore } from '@/stores/wrapFlowStore';
import { getEventDetail } from '@/services/events.service';
import { HoldToConfirm } from '@/components/wrap/HoldToConfirm';
import { Button, Icon } from '@/components/ui';
import { themedStyles } from '@/theme';

// Would you do this again? Hold it, because the tally is public.
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

  // Already in the route's cache — the flow fetched it on mount, so this is a
  // cache read, not a second request.
  const { data: event } = useQuery({
    queryKey: queryKeys.eventDetail.of(eventId),
    queryFn: () => getEventDetail(eventId!),
    enabled: !!eventId,
  });

  const done = !!status?.encoreRequested;
  const isHost = !!status?.isHost;
  const hostName = event?.host?.name ?? event?.host_name ?? 'The host';
  const others = Math.max(0, (status?.encoreCount ?? 1) - 1);

  // Forked by role: a host asking for a round two is telling the room, a guest
  // is telling the host. Same table, different sentence.
  const doneLine = isHost
    ? 'Everyone who came will know you want to run it back.'
    : others === 0
      ? `You want to run it back. ${hostName} has been told.`
      : `You and ${others} ${others === 1 ? 'other' : 'others'} want to run it back. ${hostName} has been told.`;

  return (
    <View style={styles.wrap}>
      <Animated.View entering={FadeInDown.duration(320)} style={styles.body}>
        {done ? (
          <View style={styles.doneGlyph}>
            <Icon name="check" size={38} color={COLORS.success} strokeWidth={2.4} />
          </View>
        ) : (
          <HoldToConfirm durationMs={1200} onComplete={() => encore.mutate(true)}>
            <Icon name="rewind" size={38} color={COLORS.primary} strokeWidth={2} />
          </HoldToConfirm>
        )}

        <Text style={styles.title}>
          {done ? "You're in" : 'Run it back?'}
        </Text>
        <Text style={styles.sub}>
          {done ? doneLine : 'Hold to tell the host you’d do this again.'}
        </Text>

        {/* The count is shown BEFORE the hold as well as after — it is what
            makes holding feel worth it. */}
        <Text style={styles.count}>
          {status?.encoreCount
            ? `${status.encoreCount} ${
                status.encoreCount === 1 ? 'person wants' : 'people want'
              } to run it back`
            : 'Be the first to run it back'}
        </Text>
        <Text style={styles.public}>Everyone who came can see this count.</Text>
      </Animated.View>

      <View style={styles.footer}>
        <Button
          variant={done ? 'secondary' : 'tertiary'}
          label={done ? 'Continue' : 'Skip'}
          onPress={next}
        />
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
  doneGlyph: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: 'rgba(31,164,99,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.titleLg,
    letterSpacing: -0.48,
    color: COLORS.textPrimary,
    marginTop: SPACING[3],
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
    marginTop: SPACING[3],
  },
  public: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
  footer: { padding: SPACING[4] },
}));
