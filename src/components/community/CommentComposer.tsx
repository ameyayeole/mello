import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TextField, PressableScale, Icon } from '@/components/ui';
import MentionAutocomplete, {
  Mentionable,
  activeMentionQuery,
  insertMention,
} from '@/components/chat/MentionAutocomplete';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';

const MAX = 500;

// The comment/reply input pinned to the bottom of the comment sheet. When
// `replyToName` is set it shows a "Replying to X" banner + switches the
// placeholder, and `prefill` seeds the field (e.g. "@user " when replying to a
// reply). Send is a bare glyph (muted when empty, coral when ready) rather than
// an IconButton — IconButton has no disabled state and this needs one.
export function CommentComposer({
  replyToName,
  prefill,
  people,
  onSubmit,
  onCancelReply,
  pending,
}: {
  replyToName: string | null;
  prefill: string;
  people: Mentionable[];
  onSubmit: (body: string) => void;
  onCancelReply: () => void;
  pending: boolean;
}) {
  // Seeded from `prefill`; the parent remounts this (via a key) when the reply
  // target changes, so a fresh "@user " prefix appears without a setState effect.
  const [text, setText] = useState(prefill);
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX && !pending;
  // Non-null while the user is mid-"@…" token → show the people strip.
  const mentionQuery = activeMentionQuery(text);

  function send() {
    if (!canSend) return;
    onSubmit(trimmed);
    setText('');
  }

  return (
    <View style={styles.wrap}>
      {mentionQuery !== null ? (
        <MentionAutocomplete
          query={mentionQuery}
          people={people}
          onPick={(u) => setText((t) => insertMention(t, u))}
        />
      ) : null}
      {replyToName ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText} numberOfLines={1}>
            Replying to {replyToName}
          </Text>
          <PressableScale onPress={onCancelReply} accessibilityLabel="Cancel reply">
            <Icon name="close" size={16} color={COLORS.textMuted} />
          </PressableScale>
        </View>
      ) : null}
      <View style={styles.row}>
        <View style={styles.field}>
          <TextField
            value={text}
            onChangeText={(t) => setText(t.slice(0, MAX))}
            placeholder={replyToName ? 'Add a reply…' : 'Add a comment…'}
            multiline
            maxLength={MAX}
          />
        </View>
        <PressableScale
          onPress={send}
          style={styles.send}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Icon
            name="send"
            size={22}
            color={canSend ? COLORS.primary : COLORS.placeholder}
          />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING[2] },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[2],
  },
  bannerText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING[2] },
  field: { flex: 1 },
  send: { paddingBottom: SPACING[2] },
});
