import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Sheet, Button, TextField, PressableScale, NavButton } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';
import { useCreatePost } from '@/hooks/usePostMutations';
import { PostVisibility } from '@/types/models';

const MAX = 280;

// Text composer for the Community feed: a body field capped at MAX chars and
// a friends/public visibility toggle. The toggle is a bespoke segmented pair
// of chips rather than `Button` — it's a single-select group, not two
// standalone actions, so neither of the three button variants fits (per
// AGENTS.md's "only then write something bespoke" rule).
export function ComposePostSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('friends');
  const create = useCreatePost();

  const trimmed = body.trim();
  const canPost = trimmed.length > 0 && trimmed.length <= MAX && !create.isPending;

  function reset() {
    setBody('');
    setVisibility('friends');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function submit() {
    if (!canPost) return;
    create.mutate(
      { body: trimmed, visibility },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          reset();
          onClose();
        },
        onError: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      }
    );
  }

  return (
    <Sheet visible={visible} onClose={handleClose} keyboardAvoiding grabber style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>New post</Text>
        <NavButton icon="close" onPress={handleClose} accessibilityLabel="Close" />
      </View>

      <TextField
        value={body}
        onChangeText={(t) => setBody(t.slice(0, MAX))}
        placeholder="What's happening in your city?"
        multiline
        maxLength={MAX}
        showCount
        autoFocus
      />

      <View style={styles.visRow}>
        {(['friends', 'public'] as PostVisibility[]).map((v) => {
          const active = visibility === v;
          return (
            <PressableScale
              key={v}
              onPress={() => {
                Haptics.selectionAsync();
                setVisibility(v);
              }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {v === 'friends' ? 'Friends' : 'Public'}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      <Button
        variant="secondary"
        size="lg"
        label="Post"
        onPress={submit}
        disabled={!canPost}
        loading={create.isPending}
        fullWidth
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { padding: SPACING[5], gap: SPACING[4] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.title,
    color: COLORS.textPrimary,
  },
  visRow: { flexDirection: 'row', gap: SPACING[2] },
  chip: {
    paddingVertical: SPACING[2],
    paddingHorizontal: SPACING[4],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.inkSubtle,
  },
  chipActive: { backgroundColor: COLORS.accent },
  chipText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  chipTextActive: { color: COLORS.white },
});
