import { View,
  Text } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { RADIUS, SPACING } from '@/constants/spacing';
import { PREMIUM_GOLD, PREMIUM_GOLD_TINT } from '@/utils/premium';
import { Button, Icon } from '@/components/ui';
import { themedStyles } from '@/theme';

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
export function DeckEmptyCard({
  reason,
  onBeforeNavigate,
  onRetry,
}: {
  reason: DeckEmptyReason;
  // Called immediately before this card pushes a route, so whoever is
  // rendering it can get out of the way first.
  //
  // This exists because of where the card is rendered, not because of anything
  // it does: `EventDeck` mounts it inside `CardPortal`'s `FullWindowOverlay`,
  // which attaches to the key window and therefore paints OVER any pushed
  // route. Pushing `/premium` from in here without minimizing first mounts the
  // paywall underneath the deck — a free user taps "Get Mello+", nothing
  // visibly happens, and the paywall then appears from nowhere when they later
  // tap the dim. The deleted `spendSwipe` guarded this by ordering
  // `close()` before `router.push`; this callback is that guard, handed back.
  //
  // A callback rather than importing the deck's state: this component stays
  // dumb, and the one caller that has a window layer to escape is the one that
  // passes it.
  onBeforeNavigate?: () => void;
  // Refetches the deck. Only `reason === 'error'` has anything to do with it —
  // the card previously showed the "couldn't load" message with no way to act
  // on it, because its only button was gated on the paywall branch.
  onRetry?: () => void;
}) {
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
          onPress={() => {
            onBeforeNavigate?.();
            router.push('/premium?reason=swipes');
          }}
          style={styles.cta}
        />
      )}

      {/* `tertiary`, not `primary`: retrying a failed load is a low-stakes
          "try that again", not the one decision on the surface — and the deck
          spends its coral on Join. No navigation, so no `onBeforeNavigate`. */}
      {reason === 'error' && onRetry && (
        <Button
          label="Try again"
          variant="tertiary"
          height={44}
          onPress={onRetry}
          style={styles.cta}
        />
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
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
}));
