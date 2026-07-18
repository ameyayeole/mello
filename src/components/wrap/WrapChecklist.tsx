import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Icon, IconName, PressableScale } from '@/components/ui';
import { WrapStatus } from '@/types/models';
import { wrapStepsDone, wrapStepTotal } from '@/hooks/useWrap';

export type WrapStep = 'rate' | 'photos' | 'superlatives' | 'feedback';

interface StepRow {
  id: WrapStep;
  icon: IconName;
  title: string;
  sub: string;
  done: boolean;
}

function buildSteps(status: WrapStatus): StepRow[] {
  const steps: StepRow[] = [
    {
      id: 'rate',
      icon: 'thumbsUp',
      title: 'Rate the people you met',
      sub:
        status.coAttendeeCount === 0
          ? 'No one else was there'
          : `${Math.min(status.ratedCount, status.coAttendeeCount)}/${status.coAttendeeCount} rated`,
      done:
        status.coAttendeeCount > 0 &&
        status.ratedCount >= status.coAttendeeCount,
    },
    {
      id: 'photos',
      icon: 'camera',
      title: 'Add your best photos',
      sub:
        status.myPhotoCount > 0
          ? `${status.myPhotoCount}/4 added`
          : 'Up to 4 · top 6 go to Explore',
      done: status.myPhotoCount > 0,
    },
    {
      id: 'superlatives',
      icon: 'crown',
      title: 'Vote the superlatives',
      sub: `${status.votedCategories.length}/4 categories voted`,
      done: status.votedCategories.length >= 4,
    },
  ];
  if (!status.isHost) {
    steps.push({
      id: 'feedback',
      icon: 'heart',
      title: 'Rate the event for the host',
      sub: status.feedbackDone ? 'Sent privately to the host' : 'Private, takes 5 seconds',
      done: status.feedbackDone,
    });
  }
  return steps;
}

// Instagram-profile-completion style checklist. Expanded (first few views)
// shows every step; collapsed shows just the progress summary row.
export function WrapChecklist({
  status,
  expanded,
  onStepPress,
}: {
  status: WrapStatus;
  expanded: boolean;
  onStepPress: (step: WrapStep) => void;
}) {
  const steps = buildSteps(status);
  const done = wrapStepsDone(status);
  const total = wrapStepTotal(status);
  const allDone = done >= total;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.progressRing}>
          <Text style={styles.progressText}>
            {done}/{total}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {allDone ? 'Wrap complete!' : 'Finish your wrap'}
          </Text>
          <Text style={styles.headerSub}>
            {allDone
              ? 'Your night in numbers is unlocked below.'
              : `${total - done} ${total - done === 1 ? 'step' : 'steps'} to unlock your night in numbers`}
          </Text>
        </View>
        {allDone && (
          <View style={styles.doneBadge}>
            <Icon name="check" size={16} color="#fff" strokeWidth={3} />
          </View>
        )}
      </View>

      {expanded && (
        <View style={styles.stepList}>
          {steps.map((step) => (
            <PressableScale
              key={step.id}
              scaleTo={0.98}
              style={styles.stepRow}
              onPress={() => onStepPress(step.id)}
              accessibilityRole="button"
              accessibilityLabel={step.title}
            >
              <View
                style={[styles.stepIcon, step.done && styles.stepIconDone]}
              >
                {step.done ? (
                  <Icon name="check" size={17} color="#fff" strokeWidth={3} />
                ) : (
                  <Icon
                    name={step.icon}
                    size={17}
                    color={COLORS.primary}
                    strokeWidth={2}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.stepTitle, step.done && styles.stepTitleDone]}
                >
                  {step.title}
                </Text>
                <Text style={styles.stepSub}>{step.sub}</Text>
              </View>
              {!step.done && (
                <Icon
                  name="chevronRight"
                  size={18}
                  color="rgba(15,24,44,0.35)"
                />
              )}
            </PressableScale>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    shadowColor: '#0F182C',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  progressRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    fontFamily: FONTS.heavy,
    fontSize: 14,
    color: COLORS.primary,
  },
  headerTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 16,
    letterSpacing: -0.32,
    color: COLORS.textPrimary,
  },
  headerSub: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    lineHeight: 17,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  doneBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepList: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIconDone: { backgroundColor: COLORS.success },
  stepTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  stepTitleDone: { color: COLORS.textSecondary },
  stepSub: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },
});
