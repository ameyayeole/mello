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
import { Button, Glass, Icon, PressableScale } from '@/components/ui';
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
          <Glass
            radius={RADIUS['2xl']}
            style={[styles.thumbPane, rating === 'up' && styles.thumbPaneUp]}
          >
            <PressableScale
              scaleTo={0.94}
              style={styles.thumbBtn}
              onPress={() => setRating('up')}
              accessibilityRole="button"
              accessibilityLabel="Good event"
            >
              <Icon name="thumbsUp" size={26} color={COLORS.success} strokeWidth={2.4} />
              <Text style={[styles.thumbLabel, rating === 'up' && styles.thumbLabelOn]}>
                Loved it
              </Text>
            </PressableScale>
          </Glass>
          <Glass
            radius={RADIUS['2xl']}
            style={[styles.thumbPane, rating === 'down' && styles.thumbPaneDown]}
          >
            <PressableScale
              scaleTo={0.94}
              style={styles.thumbBtn}
              onPress={() => setRating('down')}
              accessibilityRole="button"
              accessibilityLabel="Not great"
            >
              <Icon name="thumbsDown" size={26} color={COLORS.error} strokeWidth={2.4} />
              <Text style={[styles.thumbLabel, rating === 'down' && styles.thumbLabelOn]}>
                Not great
              </Text>
            </PressableScale>
          </Glass>
        </View>

        <Glass radius={RADIUS.lg} style={styles.notePane}>
          <TextInput
            style={styles.noteInput}
            placeholder="Anything the host should know? (optional)"
            placeholderTextColor={inkAlpha(0.40)}
            value={note}
            onChangeText={(t) => setNote(t.slice(0, 300))}
            multiline
          />
        </Glass>
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
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.display,
    letterSpacing: -0.6,
    lineHeight: 38,
    color: COLORS.textPrimary,
  },
  sub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.body,
    lineHeight: 22,
    color: COLORS.textSecondary,
    marginTop: SPACING[2],
  },
  thumbRow: { flexDirection: 'row', gap: SPACING[3] },
  // Glass panes over the drifting background, not opaque cards on top of it.
  // The selected state is carried by the border alone — a fill would put the
  // colour back over the thing the glass exists to reveal.
  thumbPane: { flex: 1 },
  thumbPaneUp: { borderColor: COLORS.success, borderWidth: 1.5 },
  thumbPaneDown: { borderColor: COLORS.error, borderWidth: 1.5 },
  thumbBtn: {
    alignItems: 'center',
    gap: SPACING[2],
    paddingVertical: SPACING[5],
  },
  thumbLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textSecondary,
  },
  thumbLabelOn: { color: COLORS.textPrimary },
  notePane: {},
  noteInput: {
    minHeight: 90,
    padding: SPACING[3.5],
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
    textAlignVertical: 'top',
  },
  footer: { padding: SPACING[4], paddingTop: SPACING[2] },
}));
