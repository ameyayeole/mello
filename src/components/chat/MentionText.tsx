import { Text, TextStyle, StyleProp } from 'react-native';
import { useRouter } from 'expo-router';
import { FONTS } from '@/constants/typography';

// Message text with @username tokens highlighted; known usernames tap through
// to the profile. `mentionables` maps lowercase username → profile id.

interface MentionTextProps {
  content: string;
  style?: StyleProp<TextStyle>;
  mentionables?: Map<string, string>;
  light?: boolean;
}

const MENTION_RE = /@([a-zA-Z0-9._]+)/g;

export default function MentionText({
  content,
  style,
  mentionables,
  light,
}: MentionTextProps) {
  const router = useRouter();
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(content))) {
    const userId = mentionables?.get(match[1].toLowerCase());
    if (!userId) continue;
    if (match.index > last) parts.push(content.slice(last, match.index));
    const handle = match[0];
    parts.push(
      <Text
        key={key++}
        style={{
          fontFamily: FONTS.bold,
          color: light ? '#fff' : '#4F7DF9',
          textDecorationLine: light ? 'underline' : 'none',
        }}
        onPress={() => router.push(`/friends/${userId}`)}
        suppressHighlighting
      >
        {handle}
      </Text>
    );
    last = match.index + handle.length;
  }
  if (last < content.length) parts.push(content.slice(last));

  return <Text style={style}>{parts.length > 0 ? parts : content}</Text>;
}
