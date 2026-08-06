import { useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Button, Icon, PressableScale, Sheet, TextField } from '@/components/ui';
import { themedStyles } from '@/theme';

// Writing a poll: a question and between two and four answers.
//
// Four, matching the community's polls (058) — the ceiling is a product rule
// about how many things a group can actually choose between, not a technical
// one, and the two surfaces should not disagree about it. Two is the floor
// because one option is not a question.
//
// A `Sheet` rather than a route: you are in the middle of a conversation, and
// the thread should still be behind you.
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

export default function PollComposer({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  // Question and the non-empty options, in order.
  onCreate: (question: string, options: string[]) => void;
}) {
  // What is left of the screen once the keyboard has taken its share. A
  // fraction rather than a fixed height, because "enough room" is a different
  // number of points on an SE and on a Pro Max.
  const { height } = useWindowDimensions();
  const maxHeight = height * 0.45;

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = question.trim().length > 0 && filled.length >= MIN_OPTIONS;

  function reset() {
    setQuestion('');
    setOptions(['', '']);
  }

  function close() {
    reset();
    onClose();
  }

  function create() {
    if (!ready) return;
    onCreate(question.trim(), filled);
    reset();
  }

  function setOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  return (
    // `keyboardAvoiding`, or the keyboard the question field opens sits on top of
    // the answers and the Send button — the sheet is anchored to the bottom
    // edge, which is exactly where the keyboard arrives. It is opt-in on `Sheet`
    // because most sheets are option lists with nothing to type into.
    <Sheet visible={visible} onClose={close} keyboardAvoiding>
      <ScrollView
        // Four answers plus the question, on a small phone, with the keyboard
        // up: the card can be taller than what is left of the screen. Scrolling
        // inside it keeps Send reachable instead of pushing it off the top.
        style={{ maxHeight }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>New poll</Text>

        <TextField
          label="Question"
          value={question}
          onChangeText={setQuestion}
          placeholder="Where are we meeting?"
          maxLength={120}
          autoFocus
        />

        <View style={styles.options}>
          {options.map((option, index) => (
            <TextField
              key={index}
              label={index === 0 ? 'Answers' : undefined}
              value={option}
              onChangeText={(value) => setOption(index, value)}
              placeholder={`Option ${index + 1}`}
              maxLength={60}
            />
          ))}
        </View>

        {options.length < MAX_OPTIONS && (
          <PressableScale
            scaleTo={0.97}
            style={styles.add}
            onPress={() => setOptions((prev) => [...prev, ''])}
            accessibilityRole="button"
            accessibilityLabel="Add another option"
          >
            <Icon name="plus" size={16} color={COLORS.primary} strokeWidth={2.4} />
            <Text style={styles.addLabel}>Add option</Text>
          </PressableScale>
        )}

        <Text style={styles.note}>
          Everyone in this chat can vote once. Votes are anonymous and final.
        </Text>

        <Button
          label="Send poll"
          variant="primary"
          size="md"
          fullWidth
          disabled={!ready}
          onPress={create}
        />
      </ScrollView>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  // `Sheet`'s card brings the radius and a bottom inset and nothing else — each
  // caller pads its own content (`NoteComposer` at SPACING[5], `OptionSheet` at
  // [4]). Without this the fields ran edge to edge, touching both sides of the
  // screen. Matching NoteComposer, the app's other sheet you type into.
  body: {
    padding: SPACING[5],
    paddingBottom: SPACING[2],
    gap: SPACING[3.5],
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
  },
  options: { gap: SPACING[2.5] },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING[1.5],
    paddingVertical: SPACING[1],
  },
  addLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.primary,
  },
  note: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
}));
