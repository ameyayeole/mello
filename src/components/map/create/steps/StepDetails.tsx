import { memo } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { DESCRIPTION_MAX, TITLE_MAX } from '@/utils/eventDraft';
import { useCreateEventStore } from '@/stores/createEventStore';
import { StepShell } from '../StepShell';

// Step 1 — name it.
//
// Subscribes to `title` and `description` and nothing else, so a keystroke
// re-renders these two fields rather than the pin, the location pill, the
// pickers and the safety toggles along with them.
export const StepDetails = memo(function StepDetails() {
  const title = useCreateEventStore((s) => s.title);
  const setTitle = useCreateEventStore((s) => s.setTitle);
  const description = useCreateEventStore((s) => s.description);
  const setDescription = useCreateEventStore((s) => s.setDescription);

  return (
    <StepShell>
      <TextInput
        style={styles.input}
        placeholder="e.g. Sunset rooftop drinks"
        placeholderTextColor={COLORS.placeholder}
        value={title}
        onChangeText={setTitle}
        maxLength={TITLE_MAX}
        autoFocus
        returnKeyType="done"
      />
      <Text style={styles.charCount}>
        {title.length}/{TITLE_MAX}
      </Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Short and inviting works best."
        placeholderTextColor={COLORS.placeholder}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={DESCRIPTION_MAX}
      />
      {/* The field silently stops accepting input at the cap. The title above
          it has always said so; this one only shows the count once it is close
          enough to matter, so an empty box is not pre-loaded with "0/500". */}
      {description.length > DESCRIPTION_MAX * 0.8 && (
        <Text style={styles.charCount}>
          {description.length}/{DESCRIPTION_MAX}
        </Text>
      )}
    </StepShell>
  );
});

const styles = StyleSheet.create({
  input: {
    height: 50,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING[3.5],
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textPrimary,
    marginTop: SPACING[4],
  },
  multiline: {
    height: undefined,
    minHeight: 88,
    paddingVertical: SPACING[3],
    textAlignVertical: 'top',
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodyMd,
    marginTop: SPACING[3],
  },
  charCount: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: SPACING[1.5],
  },
});
