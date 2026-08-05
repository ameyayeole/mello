import {  } from 'react-native';
import MentionText from '@/components/chat/MentionText';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { themedStyles } from '@/theme';

// The caption/body of a text or photo post. Rendered through MentionText so
// @handles present in `mentionables` (lowercase username → id) highlight and tap
// through; it falls back to plain text when the map is absent or a token doesn't
// resolve, so a mention-free caption is unchanged.
export function TextPostBody({
  body,
  mentionables,
  onDark = false,
}: {
  body: string;
  mentionables?: Map<string, string>;
  onDark?: boolean;
}) {
  return (
    <MentionText
      content={body}
      style={[styles.body, onDark && styles.bodyOnDark]}
      mentionables={mentionables}
    />
  );
}

const styles = themedStyles(() => ({
  body: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.body,
    lineHeight: TYPE_SIZE.body * 1.4,
    color: COLORS.textPrimary,
    marginTop: SPACING[3],
  },
  bodyOnDark: { color: COLORS.white },
}));
