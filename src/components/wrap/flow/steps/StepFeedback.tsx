import { memo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS, inkAlpha } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { useWrap } from '@/hooks/useWrap';
import { useWrapFlowStore } from '@/stores/wrapFlowStore';
import { Button, Icon, PressableScale } from '@/components/ui';
import { themedStyles } from '@/theme';

// Private event feedback for the host: thumbs + optional note, anonymous.
// Guests only — the host does not rate their own event, so wrapFlowSteps drops
// this step for them.
//
// The rating is required to advance; the note is NOT. Asking twice for one
// opinion is how you get people typing "good" to get past a gate.
//
// No props — see AGENTS.md.
export const StepFeedback = memo(function StepFeedback() {
  const eventId = useWrapFlowStore((s) => s.eventId) ?? undefined;
  const next = useWrapFlowStore((s) => s.next);
  const { feedback, status } = useWrap(eventId);

  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [note, setNote] = useState('');

  function handleSend() {
    if (!rating) return;
    feedback.mutate(
      { rating, note: note.trim() || undefined },
      { onSuccess: next }
    );
  }

  // Already sent on an earlier run through the flow — nothing to ask twice.
  if (status?.feedbackDone) {
    return (
      <View style={styles.doneWrap}>
        <Icon name="check" size={30} color={COLORS.success} strokeWidth={2.4} />
        <Text style={styles.title}>Feedback already sent</Text>
        <Text style={styles.sub}>
          The host only ever sees anonymous totals and notes.
        </Text>
        <Button
          label="Continue"
          onPress={next}
          style={{ alignSelf: 'stretch', marginTop: SPACING[4] }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text style={styles.title}>How was it?</Text>
          <Text style={styles.sub}>
            Goes privately to the host. Your name is never attached.
          </Text>
        </View>

        <View style={styles.thumbRow}>
          <PressableScale
            scaleTo={0.94}
            style={[styles.thumbBtn, rating === 'up' && styles.thumbBtnUp]}
            onPress={() => setRating('up')}
            accessibilityRole="button"
            accessibilityLabel="Good event"
          >
            <Icon name="thumbsUp" size={26} color={COLORS.success} strokeWidth={2.4} />
            <Text style={[styles.thumbLabel, rating === 'up' && styles.thumbLabelOn]}>
              Loved it
            </Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.94}
            style={[styles.thumbBtn, rating === 'down' && styles.thumbBtnDown]}
            onPress={() => setRating('down')}
            accessibilityRole="button"
            accessibilityLabel="Not great"
          >
            <Icon name="thumbsDown" size={26} color={COLORS.error} strokeWidth={2.4} />
            <Text style={[styles.thumbLabel, rating === 'down' && styles.thumbLabelOn]}>
              Not great
            </Text>
          </PressableScale>
        </View>

        <View>
          <TextInput
            style={styles.noteInput}
            placeholder="Anything the host should know? (optional)"
            placeholderTextColor={inkAlpha(0.40)}
            value={note}
            onChangeText={(t) => setNote(t.slice(0, 300))}
            multiline
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Send privately"
          onPress={handleSend}
          loading={feedback.isPending}
          disabled={!rating}
        />
      </View>
    </KeyboardAvoidingView>
  );
});

const styles = themedStyles(() => ({
  scroll: { padding: SPACING[5], gap: SPACING[4] },
  doneWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[6],
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
    color: COLORS.textSecondary,
    marginTop: SPACING[1.5],
    textAlign: 'center',
  },
  thumbRow: { flexDirection: 'row', gap: SPACING[3] },
  thumbBtn: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING[2],
    paddingVertical: SPACING[5],
    borderRadius: RADIUS['2xl'],
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  thumbBtnUp: {
    borderColor: COLORS.success,
    backgroundColor: 'rgba(31,164,99,0.07)',
  },
  thumbBtnDown: {
    borderColor: COLORS.error,
    backgroundColor: 'rgba(239,68,68,0.06)',
  },
  thumbLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textSecondary,
  },
  thumbLabelOn: { color: COLORS.textPrimary },
  noteInput: {
    minHeight: 90,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING[3.5],
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  footer: { padding: SPACING[4], paddingTop: SPACING[2] },
}));
