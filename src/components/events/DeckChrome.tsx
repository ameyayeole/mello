import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { useSwipeDeck } from '@/hooks/useSwipeDeck';
import { PREMIUM_GOLD } from '@/utils/premium';
import { Icon, PressableScale } from '@/components/ui';

// The swipe deck's furniture, laid over its dim.
//
// This used to be the chrome of a whole screen (`app/events/swipe.tsx`, now
// deleted): a dark header with the swipes-left count, a pass/save/undo row
// under the deck, and a paywall card in place of the deck once the daily cap
// was hit. It then became part of the map pin's dealt card for one deal
// (`EventDealtCard`'s now-deleted `isSwipeDeck` branch), and is `EventDeck`'s
// alone now — the deck reads live from `useSwipeDeck()` rather than a snapshot
// of ids, so this furniture, the deck's stack and its quota all live in one
// component instead of being split across a screen or a second dealt card.
//
// It stayed its own component through both moves rather than something the
// underlying card primitive knows about: `DealtCard` takes `header`/`footer`
// as opaque nodes, so whatever renders it can bring controls or bring none,
// and neither has to know about the other.
//
// `useSwipeDeck` is called HERE rather than threaded down as props, because
// that hook owns real queries — the deck, the day's swipe count — and mounting
// it any higher than where it is actually rendered would run those queries
// even when the deck isn't visible. `EventDeck` mirrors this same discipline
// one level up: see its own comment on why it is split into a visibility gate
// and a body.

// The counter, top-centre. Premium has no cap, so it says nothing at all
// rather than an infinity glyph that has to be explained.
export function DeckCounter() {
  const insets = useSafeAreaInsets();
  const { swipesLeft, premium } = useSwipeDeck();
  if (premium) return null;
  return (
    <View style={[styles.counterWrap, { paddingTop: insets.top + SPACING[2] }]}>
      <View style={styles.counterPill}>
        <Text style={styles.counterText}>
          {swipesLeft} free {swipesLeft === 1 ? 'swipe' : 'swipes'} left today
        </Text>
      </View>
    </View>
  );
}

/**
 * Pass / save / undo, under the card.
 *
 * The two outer buttons do what a swipe does, for anyone who would rather tap —
 * so they are handed the same callbacks the gesture fires, not their own copies
 * of the logic. Undo is the one thing the gesture cannot do, and it is a Mello+
 * perk: a free user still taps through, to the paywall.
 */
export function DeckActions({
  onPass,
  onSave,
  disabled,
}: {
  onPass: () => void;
  onSave: () => void;
  disabled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { undo, canUndo, premium } = useSwipeDeck();

  function onUndo() {
    if (!premium) {
      router.push('/premium?reason=swipes');
      return;
    }
    undo();
  }

  return (
    <View
      style={[styles.actions, { paddingBottom: insets.bottom + SPACING[5] }]}
      pointerEvents="box-none"
    >
      <PressableScale
        scaleTo={0.85}
        style={[styles.actionBtn, disabled && styles.actionDisabled]}
        onPress={onPass}
        accessibilityRole="button"
        accessibilityLabel="Pass on this event"
      >
        <Icon name="close" size={28} color={COLORS.textSecondary} strokeWidth={2.4} />
      </PressableScale>
      <PressableScale
        scaleTo={0.85}
        style={[styles.actionBtn, styles.likeBtn, disabled && styles.actionDisabled]}
        onPress={onSave}
        accessibilityRole="button"
        accessibilityLabel="Add this event to your wishlist"
      >
        <Icon name="bookmarkFilled" size={28} color={COLORS.white} strokeWidth={2.4} />
      </PressableScale>
      <PressableScale
        scaleTo={0.85}
        style={[
          styles.actionBtn,
          styles.undoBtn,
          // Free users always tap through — to the paywall, not to nothing.
          premium && !canUndo && styles.actionDisabled,
        ]}
        onPress={onUndo}
        accessibilityRole="button"
        accessibilityLabel="Undo last swipe"
      >
        <Icon name="undo" size={22} color={COLORS.white} strokeWidth={2.2} />
        {!premium && (
          <View style={styles.undoCrown}>
            <Icon name="crown" size={10} color={PREMIUM_GOLD} strokeWidth={2.4} />
          </View>
        )}
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  counterWrap: { alignItems: 'center', paddingHorizontal: SPACING[4] },
  // Smoked glass rather than the old solid header bar: it is sitting on the
  // dim now, not on a screen, and a bar would read as chrome the card is
  // attached to.
  counterPill: {
    paddingHorizontal: SPACING[3.5],
    paddingVertical: SPACING[2],
    borderRadius: 100,
    backgroundColor: COLORS.glassOnPhoto,
    borderWidth: 1,
    borderColor: COLORS.glassBorderOnPhoto,
  },
  counterText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.white,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING[5],
  },
  actionBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  likeBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: COLORS.primary },
  undoBtn: { backgroundColor: COLORS.accent },
  actionDisabled: { opacity: 0.45 },
  undoCrown: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
