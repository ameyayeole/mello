import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { RADIUS, SPACING } from '@/constants/spacing';
import { PREMIUM_GOLD, PREMIUM_GOLD_TINT } from '@/utils/premium';
import { Button, Icon } from '@/components/ui';

// Why the deck has nothing to show. Two different dead ends, and they want
// different words: one is "come back later", the other is "come back tomorrow,
// or pay".
export type DeckEmptyReason = 'caughtUp' | 'outOfSwipes' | 'error';

/**
 * The card the deck shows when there is no event to show.
 *
 * It is a card, not an empty screen, on purpose: the deck never collapses to
 * nothing. You swiped the last one away and something is still there, in the
 * same place, the same size, so the surface you are looking at does not vanish
 * under your thumb. The old swipe screen did the same thing for the same
 * reason ("the deck never vanishes" — app/events/swipe.tsx, deleted); this is
 * that idea carried onto the dealt card.
 *
 * Rendered as a `DealtCard` face, so it deals in and dismisses exactly like a
 * real card. It just has nothing on the back and nothing to swipe.
 */
export function DeckEmptyCard({ reason }: { reason: DeckEmptyReason }) {
  const router = useRouter();
  const premium = reason === 'outOfSwipes';

  return (
    <View style={styles.card}>
      <View style={[styles.icon, premium && styles.iconPremium]}>
        <Icon
          name={
            reason === 'error' ? 'warning' : premium ? 'crown' : 'check'
          }
          size={34}
          color={premium ? PREMIUM_GOLD : COLORS.primary}
          strokeWidth={2.4}
        />
      </View>

      <Text style={styles.title}>
        {reason === 'error'
          ? "Couldn't load events"
          : premium
            ? 'Out of swipes for today'
            : "You're all caught up"}
      </Text>

      <Text style={styles.body}>
        {reason === 'error'
          ? 'Something went wrong — give it another go in a moment.'
          : premium
            ? 'Your 10 free swipes are used up — they reset at midnight. Mello+ members swipe without limits.'
            : 'No more events to swipe right now. Check again later — new plans pop up all day.'}
      </Text>

      {premium && (
        <Button
          label="Get Mello+ · unlimited swipes"
          height={44}
          onPress={() => router.push('/premium?reason=swipes')}
          style={styles.cta}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills whatever face it is given, like `EventCard` does — the dealt card
  // owns the size, the radius and the shadow.
  card: {
    flex: 1,
    borderRadius: RADIUS['2xl'],
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[6],
    gap: SPACING[3],
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryTint,
    marginBottom: SPACING[1],
  },
  iconPremium: { backgroundColor: PREMIUM_GOLD_TINT },
  title: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.title,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: TYPE_SIZE.bodySm * 1.5,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  cta: { marginTop: SPACING[2] },
});
