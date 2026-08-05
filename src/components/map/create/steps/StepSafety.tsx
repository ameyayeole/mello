import { memo, useState } from 'react';
import { Text,
  View } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Toggle } from '@/components/ui';
import { FemaleOnlyConfirmModal } from '@/components/safety';
import { useAuthStore } from '@/stores/authStore';
import { useCreateEventStore } from '@/stores/createEventStore';
import { StepShell } from '../StepShell';
import { themedStyles } from '@/theme';

// Step 4 — who can see it and who can join.
export const StepSafety = memo(function StepSafety() {
  const user = useAuthStore((s) => s.user);
  const isPublic = useCreateEventStore((s) => s.isPublic);
  const setIsPublic = useCreateEventStore((s) => s.setIsPublic);
  const requiresApproval = useCreateEventStore((s) => s.requiresApproval);
  const setRequiresApproval = useCreateEventStore((s) => s.setRequiresApproval);
  const womenOnly = useCreateEventStore((s) => s.womenOnly);
  const setWomenOnly = useCreateEventStore((s) => s.setWomenOnly);

  // Local: the confirm belongs to this toggle and nothing else opens it.
  const [confirmVisible, setConfirmVisible] = useState(false);

  return (
    <StepShell>
      <View style={styles.safetyRow}>
        <View style={styles.safetyText}>
          <Text style={styles.safetyLabel}>Public event</Text>
          <Text style={styles.safetySub}>
            {isPublic ? 'Visible to everyone on the map' : 'Only friends can see'}
          </Text>
        </View>
        <Toggle
          value={isPublic}
          onValueChange={setIsPublic}
          accessibilityLabel="Public event"
        />
      </View>
      <View style={styles.safetyRow}>
        <View style={styles.safetyText}>
          <Text style={styles.safetyLabel}>Approve who joins</Text>
          <Text style={styles.safetySub}>
            {requiresApproval
              ? 'You approve each person'
              : 'Anyone can join instantly'}
          </Text>
        </View>
        <Toggle
          value={requiresApproval}
          onValueChange={setRequiresApproval}
          accessibilityLabel="Approve who joins"
        />
      </View>
      {/* Female-only hosting is offered to female profiles only. */}
      {user?.gender === 'female' && (
        <View style={styles.safetyRow}>
          <View style={styles.safetyText}>
            <Text style={styles.safetyLabel}>Female-only event</Text>
            <Text style={styles.safetySub}>
              {womenOnly
                ? 'Only women can see and join'
                : 'Anyone can see and join'}
            </Text>
          </View>
          <Toggle
            value={womenOnly}
            onValueChange={(on) =>
              on ? setConfirmVisible(true) : setWomenOnly(false)
            }
            accessibilityLabel="Female-only event"
          />
        </View>
      )}

      {/* Safety popup #9: confirm creating a female-only event (every time). */}
      <FemaleOnlyConfirmModal
        visible={confirmVisible}
        onConfirm={() => {
          setWomenOnly(true);
          setConfirmVisible(false);
        }}
        onBack={() => {
          setWomenOnly(false);
          setConfirmVisible(false);
        }}
      />
    </StepShell>
  );
});

const styles = themedStyles(() => ({
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING[3.5],
  },
  // Was an inline style object, which allocated on every render of the step.
  safetyText: { flex: 1, paddingRight: SPACING[3] },
  safetyLabel: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  safetySub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
}));
