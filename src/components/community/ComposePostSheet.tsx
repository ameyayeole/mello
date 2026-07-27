import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Sheet,
  Button,
  TextField,
  PressableScale,
  NavButton,
  Icon,
} from '@/components/ui';
import { PhotoGridPicker } from '@/components/PhotoGridPicker';
import MentionAutocomplete, {
  activeMentionQuery,
  insertMention,
} from '@/components/chat/MentionAutocomplete';
import { useMentionSearch } from '@/hooks/useMentions';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';
import { useCreatePost, useCreatePoll } from '@/hooks/usePostMutations';
import { PostVisibility } from '@/types/models';

const MAX = 280;
const OPTION_MAX = 80;
const DURATIONS: (1 | 3 | 7)[] = [1, 3, 7];
type ComposeMode = 'post' | 'poll';

// Composer for the Community feed. A Post|Poll toggle switches between: a caption
// field + optional photo grid (attach ≥1 → photo post) with @mention
// autocomplete; and a poll — a question, 2–4 option fields, and a 1/3/7-day
// timer. Both share the friends/public visibility toggle. The segmented toggles
// are bespoke chip pairs rather than `Button` — single-select groups, not
// standalone actions (per AGENTS.md's "only then write something bespoke").
export function ComposePostSheet({
  visible,
  onClose,
  onPosted,
}: {
  visible: boolean;
  onClose: () => void;
  // Fired only on a successful post — `onClose` also fires on dismiss, so it
  // cannot stand in for "the user actually published something".
  onPosted?: () => void;
}) {
  const [mode, setMode] = useState<ComposeMode>('post');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [options, setOptions] = useState<string[]>(['', '']);
  const [durationDays, setDurationDays] = useState<1 | 3 | 7>(3);
  const [visibility, setVisibility] = useState<PostVisibility>('friends');
  const create = useCreatePost();
  const createPoll = useCreatePoll();

  const trimmed = body.trim();
  const hasPhotos = photos.length > 0;
  const filledOptions = options.map((o) => o.trim()).filter((o) => o.length > 0);
  // Mentions only apply to a post caption; a poll body is a plain question.
  const mentionQuery = mode === 'post' ? activeMentionQuery(body) : null;
  const people = useMentionSearch(mentionQuery);

  // Post: caption OR a photo. Poll: a question + ≥2 non-empty options.
  const canPost =
    mode === 'post'
      ? (trimmed.length > 0 || hasPhotos) &&
        trimmed.length <= MAX &&
        !create.isPending
      : trimmed.length > 0 && filledOptions.length >= 2 && !createPoll.isPending;

  const pending = mode === 'poll' ? createPoll.isPending : create.isPending;

  function reset() {
    setMode('post');
    setBody('');
    setPhotos([]);
    setOptions(['', '']);
    setDurationDays(3);
    setVisibility('friends');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function submit() {
    if (!canPost) return;
    const done = {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onPosted?.();
        reset();
        onClose();
      },
      onError: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      },
    };
    if (mode === 'poll') {
      createPoll.mutate(
        { question: trimmed, options: filledOptions, durationDays, visibility },
        done
      );
    } else {
      create.mutate({ body: trimmed, visibility, media: photos }, done);
    }
  }

  return (
    <Sheet visible={visible} onClose={handleClose} keyboardAvoiding grabber style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>New {mode === 'poll' ? 'poll' : 'post'}</Text>
        <NavButton icon="close" onPress={handleClose} accessibilityLabel="Close" />
      </View>

      {/* Post | Poll type toggle. */}
      <View style={styles.visRow}>
        {(['post', 'poll'] as ComposeMode[]).map((m) => {
          const active = mode === m;
          return (
            <PressableScale
              key={m}
              onPress={() => {
                Haptics.selectionAsync();
                setMode(m);
              }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {m === 'post' ? 'Post' : 'Poll'}
              </Text>
            </PressableScale>
          );
        })}
      </View>

      <TextField
        value={body}
        onChangeText={(t) => setBody(t.slice(0, MAX))}
        placeholder={
          mode === 'poll'
            ? 'Ask a question…'
            : hasPhotos
              ? 'Add a caption…'
              : "What's happening in your city?"
        }
        multiline
        maxLength={MAX}
        showCount
        autoFocus
      />

      {mode === 'post' ? (
        <>
          <PhotoGridPicker photos={photos} onChange={setPhotos} max={6} />

          {mentionQuery !== null ? (
            // `people` is already server-filtered for the active token; pass
            // query="" so the strip's own prefix filter doesn't drop legit
            // substring matches.
            <MentionAutocomplete
              query=""
              people={people}
              onPick={(u) => setBody((t) => insertMention(t, u))}
            />
          ) : null}
        </>
      ) : (
        <>
          {options.map((opt, i) => (
            <View key={i} style={styles.optionRow}>
              <View style={{ flex: 1 }}>
                <TextField
                  value={opt}
                  onChangeText={(t) =>
                    setOptions((prev) =>
                      prev.map((o, j) => (j === i ? t.slice(0, OPTION_MAX) : o))
                    )
                  }
                  placeholder={`Option ${i + 1}`}
                  onFocus={() => Haptics.selectionAsync()}
                />
              </View>
              {options.length > 2 ? (
                <NavButton
                  icon="close"
                  onPress={() =>
                    setOptions((prev) => prev.filter((_, j) => j !== i))
                  }
                  accessibilityLabel={`Remove option ${i + 1}`}
                />
              ) : null}
            </View>
          ))}
          {options.length < 4 ? (
            <PressableScale
              onPress={() => setOptions((prev) => [...prev, ''])}
              style={styles.addOption}
              accessibilityRole="button"
              accessibilityLabel="Add option"
            >
              <Icon name="plus" size={16} color={COLORS.textSecondary} />
              <Text style={styles.addOptionText}>Add option</Text>
            </PressableScale>
          ) : null}

          {/* Poll duration. */}
          <View style={styles.visRow}>
            {DURATIONS.map((d) => {
              const active = durationDays === d;
              return (
                <PressableScale
                  key={d}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setDurationDays(d);
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {d} day{d > 1 ? 's' : ''}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </>
      )}

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
        loading={pending}
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

  optionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2] },
  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    paddingVertical: SPACING[1],
  },
  addOptionText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
});
