import { View,
  Text,
  Pressable } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS, inkAlpha } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { themedStyles } from '@/theme';

// The quoted message, above the text of the reply that quotes it.
//
// One component for both sides of the thread, tinted by `isMine` rather than
// forked: on an ink bubble the quote has to sit on ink, and the only honest way
// to keep a quote legible there is to lighten *its* fill rather than to keep the
// light-mode colours and hope.
//
// It renders from the snapshot stored on the reply (see migration 072), not from
// a lookup, so it is complete the moment the row arrives — including a reply
// whose original has since been deleted.

// Three lines, then the text engine's own "…" — WhatsApp's shape. The clamp is
// what produces the ellipsis, so `replyTargetOf` stores more text than this can
// show on purpose; see the note on REPLY_PREVIEW_LENGTH.
//
// Three rather than two because a quote is there to identify which message is
// being answered, and two lines of a long message often stops before the part
// that distinguishes it.
const REPLY_QUOTE_LINES = 3;

export interface ReplyQuoteProps {
  senderName: string;
  preview: string;
  isMine: boolean;
  // Jump to the quoted message. Absent when the original is no longer in the
  // thread — the quote then reads as history rather than as a broken link.
  onPress?: () => void;
}

export default function ReplyQuote({
  senderName,
  preview,
  isMine,
  onPress,
}: ReplyQuoteProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      // The quote is inside the bubble's own pressable, and a nested press
      // should not also fire the bubble's long-press handler.
      style={[styles.quote, isMine && styles.quoteMine]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Replying to ${senderName}: ${preview}`}
    >
      <View style={[styles.bar, isMine && styles.barMine]} />
      <View style={styles.body}>
        <Text style={[styles.name, isMine && styles.nameMine]} numberOfLines={1}>
          {senderName}
        </Text>
        <Text
          style={[styles.preview, isMine && styles.previewMine]}
          numberOfLines={REPLY_QUOTE_LINES}
          // Explicit rather than relying on the platform default: Android's
          // default is also tail, but this is the whole visual contract of the
          // block and should not be inherited.
          ellipsizeMode="tail"
        >
          {preview || 'Message'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  quote: {
    flexDirection: 'row',
    gap: SPACING[2],
    borderRadius: RADIUS.md,
    // Tucked inside the bubble's own padding rather than inset from it: a quote
    // that floats in the middle of the bubble reads as a second bubble.
    backgroundColor: inkAlpha(0.05),
    paddingRight: SPACING[2.5],
    paddingVertical: SPACING[2],
    marginBottom: SPACING[1.5],
    // The spine is a child, so it only reaches the block's rounded corners if
    // the block clips it.
    overflow: 'hidden',
  },
  quoteMine: { backgroundColor: 'rgba(255,255,255,0.14)' },
  // The spine, flush to the block's left edge and its full height — the tell
  // that this is quoted material, and the one part that stays saturated on both
  // bubble colours. Not rounded: it is the block's edge, not a floating pill.
  bar: {
    width: 4,
    alignSelf: 'stretch',
    // Cancels the block's vertical padding so the spine runs the full height.
    marginVertical: -SPACING[2],
    backgroundColor: COLORS.primary,
  },
  barMine: { backgroundColor: COLORS.white },
  // `flexGrow`/`flexShrink` spelled out rather than `flex: 1`, which is what
  // collapsed this into a one-word-per-line column.
  //
  // `flex: 1` in React Native is grow 1 + shrink 1 + **basis 0%**. That zero
  // basis is the problem: the bubble is a shrink-to-fit box, so it sizes itself
  // to the widest thing inside it — and a zero-basis child contributes nothing to
  // that measurement. A long quote above a two-word reply therefore made a bubble
  // as wide as the *reply*, and then the quote wrapped inside those few
  // characters.
  //
  // With the basis left at `auto` the text's own width is what the bubble
  // measures, so the bubble grows to fit the quote (up to the column's 74% cap,
  // where the clamp to three lines takes over). Grow still fills the bubble when
  // the reply beneath is the wider of the two; shrink still lets the text wrap
  // rather than overflow.
  body: { flexGrow: 1, flexShrink: 1 },
  name: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.primary,
  },
  nameMine: { color: COLORS.white },
  preview: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 18,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  previewMine: { color: 'rgba(255,255,255,0.78)' },
}));
