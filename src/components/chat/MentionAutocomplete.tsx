import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Avatar, PressableScale } from '@/components/ui';

export interface Mentionable {
  id: string;
  username: string;
  name: string;
  photo_url: string | null;
}

// Detects an in-progress "@..." token at the end of the input. Returns the
// partial (may be '') or null when the user isn't typing a mention.
export function activeMentionQuery(input: string): string | null {
  const m = input.match(/(^|\s)@([a-zA-Z0-9._]*)$/);
  return m ? m[2].toLowerCase() : null;
}

// Replaces the in-progress "@..." token with the chosen @username.
export function insertMention(input: string, username: string): string {
  return input.replace(/@[a-zA-Z0-9._]*$/, `@${username} `);
}

// Horizontal strip above the input bar listing matching people to mention.
export default function MentionAutocomplete({
  query,
  people,
  onPick,
}: {
  query: string;
  people: Mentionable[];
  onPick: (username: string) => void;
}) {
  const matches = people
    .filter(
      (p) =>
        p.username &&
        (p.username.toLowerCase().startsWith(query) ||
          p.name.toLowerCase().startsWith(query))
    )
    .slice(0, 8);

  if (matches.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {matches.map((p) => (
          <PressableScale
            key={p.id}
            scaleTo={0.95}
            style={styles.chip}
            onPress={() => onPick(p.username)}
          >
            <Avatar name={p.name} photoUrl={p.photo_url} size={22} />
            <Text style={styles.chipText}>@{p.username}</Text>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,24,44,0.08)',
  },
  scroll: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 5,
    paddingRight: 12,
    height: 34,
    borderRadius: 100,
    backgroundColor: COLORS.background,
  },
  chipText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.textPrimary,
  },
});
