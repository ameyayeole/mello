import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { RADIUS, SPACING } from '@/constants/spacing';
import { useWrapDeal } from '@/hooks/useWrapDeal';
import { CardPortal } from '@/components/events/EventDealtCard';
import { DealtCard, Icon, MelloPin } from '@/components/ui';
import { themedStyles } from '@/theme';

// The app's one uninvited full-screen moment, and it fires once per event.
//
// The CTA sits ON the card's face rather than under it: a button underneath
// makes the card an illustration and the button the thing you press — two
// objects, one decorative. On the face, the card IS the affordance, so the turn
// reads as a consequence of your tap rather than a cutscene that follows it.
//
// Root-mounted, like EventDealtCard, and for the same reason: openers live on
// routes stacked above the mount, so CardPortal has to lift it out.

// The beat between the mark landing and the flow arriving. Long enough to read
// as a pause, short enough that it is not a wait.
const HOLD_MS = 150;
const FILL_MS = 260;

export function WrapDealtCard() {
  const router = useRouter();
  const { event, ready, dismiss } = useWrapDeal();
  const [leaving, setLeaving] = useState(false);
  const turned = useRef(false);

  // 0 → the card as dealt, 1 → the mark's face filling the viewport.
  const fill = useSharedValue(0);

  const go = useCallback(() => {
    if (!event) return;
    dismiss();
    router.push(`/events/wrap/flow/${event.id}`);
  }, [event, dismiss, router]);

  // The turn IS the action. Once the mark is showing, hold a beat, flood the
  // screen with it, and land in the flow — one motion, not three.
  const handleFace = useCallback(
    (backShowing: boolean) => {
      if (!backShowing || turned.current) return;
      turned.current = true;
      setLeaving(true);
      setTimeout(() => {
        fill.value = withTiming(
          1,
          { duration: FILL_MS, easing: Easing.out(Easing.cubic) },
          () => {}
        );
        setTimeout(go, FILL_MS - 40);
      }, HOLD_MS);
    },
    [fill, go]
  );

  const fillStyle = useAnimatedStyle(() => ({
    opacity: fill.value,
    transform: [{ scale: 0.7 + fill.value * 0.6 }],
  }));

  if (!ready || !event) return null;

  return (
    <CardPortal suspended={false}>
      <DealtCard
        cards={[
          {
            key: event.id,
            front: (
              <View style={styles.face}>
                <View style={styles.faceTop}>
                  <Icon name="camera" size={26} color={COLORS.white} />
                </View>
                <View style={styles.faceBottom}>
                  <Text style={styles.eyebrow} numberOfLines={1}>
                    {event.title}
                  </Text>
                  {/* One phrase, three surfaces — the launch card, the chat pin
                      and the Home row all say this. Three verbs for one action
                      reads as three different features. */}
                  <Text style={styles.cta}>Wrap it up</Text>
                  <Text style={styles.hint}>Tap the card</Text>
                </View>
              </View>
            ),
            back: (
              <View style={styles.back}>
                {/* Lottie L1 goes here, played once on the reveal, over the pin.
                    `celebration.json` stands in until it exists — the card works
                    without it, it just lands flat. See
                    docs/superpowers/specs/2026-08-07-wrap-lottie-manifest.md. */}
                <MelloPin height={96} />
              </View>
            ),
          },
        ]}
        // No origin: nothing on screen was tapped to summon this, so DealtCard's
        // no-origin path (up off the bottom edge) is the honest arrival.
        origin={null}
        onFaceChange={handleFace}
        // Swiping it away in any direction is a dismissal — there is no pass
        // and no save here, only "not now", and the flag makes that permanent
        // for this event.
        onPass={dismiss}
        onSave={dismiss}
        onDismiss={dismiss}
      />

      {leaving ? (
        <Animated.View pointerEvents="none" style={[styles.flood, fillStyle]}>
          <MelloPin height={128} />
        </Animated.View>
      ) : null}
    </CardPortal>
  );
}

const styles = themedStyles(() => ({
  face: {
    flex: 1,
    backgroundColor: COLORS.accent,
    padding: SPACING[5],
    justifyContent: 'space-between',
  },
  faceTop: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceBottom: { gap: SPACING[1] },
  eyebrow: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textOnDark,
  },
  cta: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.display,
    letterSpacing: -0.6,
    color: COLORS.white,
  },
  hint: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textOnDark,
    marginTop: SPACING[1],
  },
  // The mark's own face. No gradient on the card body — MelloLogo.tsx reserves
  // the gradient for the pin itself.
  back: {
    flex: 1,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flood: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
