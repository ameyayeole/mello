import { memo, useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { useWrap } from '@/hooks/useWrap';
import { useWrapFlowStore } from '@/stores/wrapFlowStore';
import { CompleteMoment } from '@/components/wrap/CompleteMoment';
import { wrapGateState } from '@/utils/wrapGate';
import { Avatar, Button } from '@/components/ui';
import { themedStyles } from '@/theme';

// The end of the flow, and the only place `wrap_contributions` is written.
//
// No props — see AGENTS.md.
export const StepDone = memo(function StepDone() {
  const router = useRouter();
  const eventId = useWrapFlowStore((s) => s.eventId) ?? undefined;
  const { status, contribute } = useWrap(eventId);
  const written = useRef(false);

  // Fires once. The ref guards a double-write when the query resolving
  // re-renders this step — the insert is idempotent (23505 is swallowed), but
  // a second request is still a second request.
  useEffect(() => {
    if (written.current || !eventId) return;
    written.current = true;
    contribute.mutate();
  }, [eventId, contribute]);

  const left = Math.max(
    0,
    (status?.contributorsNeeded ?? 0) - (status?.contributorCount ?? 0)
  );
  const gate = wrapGateState(status);
  const open = gate === 'open';

  return (
    <View style={styles.wrap}>
      <CompleteMoment
        title="That's your half of it"
        sub={
          open
            ? 'The group showed up. Your night in numbers is open.'
            : left === 1
              ? 'Waiting on 1 more person before the wrap opens.'
              : `Waiting on ${left} more people before the wrap opens.`
        }
      >
        {/* Who else has already contributed. A tally with faces invites you to
            join it; names of who has NOT contributed are deliberately never
            shown. */}
        {status && status.contributors.length > 0 && (
          <View style={styles.contribRow}>
            <View style={styles.contribFaces}>
              {status.contributors.slice(0, 5).map((c) => (
                <Avatar
                  key={c.id}
                  photoUrl={c.photo_url}
                  name={c.name}
                  size={26}
                  style={styles.contribFace}
                />
              ))}
            </View>
            <Text style={styles.contribText}>
              {status.contributorCount} of {status.contributorsNeeded}{' '}
              contributed
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          {open ? (
            <Button
              label="See your night in numbers"
              onPress={() => router.replace(`/events/wrap/recap/${eventId}`)}
            />
          ) : null}
          <Button
            variant="tertiary"
            label="Back to the wrap"
            onPress={() => router.replace(`/events/wrap/${eventId}`)}
          />
        </View>
      </CompleteMoment>
    </View>
  );
});

const styles = themedStyles(() => ({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  contribRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2.5],
    marginTop: SPACING[4],
  },
  contribFaces: { flexDirection: 'row' },
  contribFace: { marginRight: -SPACING[2] },
  contribText: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  actions: { marginTop: SPACING[5], gap: SPACING[2], alignSelf: 'stretch' },
}));
