import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Avatar, PressableScale } from '@/components/ui';
import { SUPERLATIVE_MAP } from '@/constants/superlatives';
import { SuperlativeWinner } from '@/types/models';

// A decided superlative: emoji + category + the winner (tap → profile).
// Undecided categories (fewer than 3 votes) render a muted "still counting" row.
export default function SuperlativeBadge({ winner }: { winner: SuperlativeWinner }) {
  const router = useRouter();
  const meta = SUPERLATIVE_MAP[winner.category];
  const decided = !!winner.winner_id;

  return (
    <PressableScale
      scaleTo={0.98}
      style={[styles.row, !decided && styles.rowMuted]}
      onPress={
        decided ? () => router.push(`/friends/${winner.winner_id}`) : undefined
      }
      disabled={!decided}
      accessibilityRole="button"
      accessibilityLabel={
        decided
          ? `${meta.label}: ${winner.winner_name}`
          : `${meta.label}: not decided yet`
      }
    >
      <Text style={styles.emoji}>{meta.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{meta.label}</Text>
        <Text style={styles.sub}>
          {decided
            ? `${winner.votes} ${winner.votes === 1 ? 'vote' : 'votes'}`
            : 'Needs 3 votes to decide'}
        </Text>
      </View>
      {decided ? (
        <View style={styles.winner}>
          <Avatar
            name={winner.winner_name}
            photoUrl={winner.winner_photo_url}
            size={30}
          />
          <Text style={styles.winnerName} numberOfLines={1}>
            {winner.winner_name}
          </Text>
        </View>
      ) : (
        <Text style={styles.tbd}>TBD</Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowMuted: { opacity: 0.65 },
  emoji: { fontSize: 26 },
  label: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  sub: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  winner: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 130 },
  winnerName: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  tbd: {
    fontFamily: FONTS.heavy,
    fontSize: 12,
    letterSpacing: 1,
    color: COLORS.textMuted,
  },
});
