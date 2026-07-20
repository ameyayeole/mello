import { View, Text, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
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
    gap: SPACING[3],
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING[3.5],
    paddingVertical: SPACING[3],
  },
  rowMuted: { opacity: 0.65 },
  emoji: { fontSize: TYPE_SIZE.titleLg },
  label: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  sub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
    marginTop: SPACING[0.5],
  },
  winner: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2], maxWidth: 130 },
  winnerName: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  tbd: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.caption,
    letterSpacing: 1,
    color: COLORS.textMuted,
  },
});
