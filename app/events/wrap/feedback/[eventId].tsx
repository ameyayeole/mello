import { useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useWrap } from '@/hooks/useWrap';
import { CompleteMoment } from '@/components/wrap/CompleteMoment';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import {
  Button,
  PressableScale,
  Screen,
  ScreenHeader,
} from '@/components/ui';

// Private event feedback for the host: thumbs + optional note, anonymous.
export default function EventFeedbackScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { feedback, status } = useWrap(eventId);

  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  function handleSend() {
    if (!rating) return;
    feedback.mutate(
      { rating, note: note.trim() || undefined },
      { onSuccess: () => setSent(true) }
    );
  }

  const done = sent || status?.feedbackDone;

  return (
    <Screen>
      <ScreenHeader title="Rate the event" tone="transparent" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {done ? (
            <View style={styles.completeWrap}>
              <CompleteMoment
                title="Feedback sent"
                sub="The host only ever sees anonymous totals and notes."
              >
                <Button
                  variant="tertiary"
                  label="Back to the wrap"
                  height={44}
                  onPress={() => router.back()}
                  style={{ marginTop: SPACING[3], alignSelf: 'stretch' }}
                />
              </CompleteMoment>
            </View>
          ) : (
            <>
              <Animated.View entering={FadeInDown.duration(300)}>
                <Text style={styles.title}>How was it?</Text>
                <Text style={styles.sub}>
                  Goes privately to the host. Your name is never attached.
                </Text>
              </Animated.View>

              <Animated.View
                entering={FadeInDown.delay(80).duration(300)}
                style={styles.thumbRow}
              >
                <PressableScale
                  scaleTo={0.94}
                  style={[styles.thumbBtn, rating === 'up' && styles.thumbBtnUp]}
                  onPress={() => setRating('up')}
                  accessibilityRole="button"
                  accessibilityLabel="Good event"
                >
                  <Text style={styles.thumbEmoji}>👍</Text>
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
                  <Text style={styles.thumbEmoji}>👎</Text>
                  <Text style={[styles.thumbLabel, rating === 'down' && styles.thumbLabelOn]}>
                    Not great
                  </Text>
                </PressableScale>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(140).duration(300)}>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Anything the host should know? (optional)"
                  placeholderTextColor="rgba(15,24,44,0.40)"
                  value={note}
                  onChangeText={(t) => setNote(t.slice(0, 300))}
                  multiline
                />
              </Animated.View>
            </>
          )}
        </ScrollView>

        {!done && (
          <View style={styles.footer}>
            <Button
              label="Send privately"
              onPress={handleSend}
              loading={feedback.isPending}
              disabled={!rating}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: SPACING[5], gap: SPACING[4] },
  completeWrap: { paddingTop: 70, alignItems: 'center' },
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
  thumbEmoji: { fontSize: TYPE_SIZE.display },
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
});
