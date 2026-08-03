import { memo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Button, NavButton, PressableScale } from '@/components/ui';
import { STEP_COUNT, canAdvanceFrom } from '@/utils/eventDraft';
import { useCreateEventStore } from '@/stores/createEventStore';
import { TAP_SCALE } from './motion';
import { StepProgress } from './StepProgress';
import { StepType } from './steps/StepType';
import { StepDetails } from './steps/StepDetails';
import { StepWhen } from './steps/StepWhen';
import { StepPhoto } from './steps/StepPhoto';
import { StepSafety } from './steps/StepSafety';

// Off the RADIUS scale, which stops at 24. The profile sheet — the app's only
// other full-bleed pane rising from the bottom edge — is also 32, and matching
// it matters more here than landing on a rung: these are the same object. If a
// third one appears, this belongs in RADIUS.
const CARD_RADIUS = 32;

// Headings live out here rather than inside each step's own JSX, so the title
// line stays put while the content below it swaps.
const STEP_HEADS = [
  "What's the plan?",
  'Name your event',
  'When, and how many?',
  'Add a cover photo',
  'Keep it safe',
];

// The Next/Host button, on its own so that typing a title re-renders a button
// rather than the card around it. It is the only thing in the chrome that has
// to watch the draft's contents.
const AdvanceButton = memo(function AdvanceButton({
  onHost,
}: {
  onHost: () => void;
}) {
  const step = useCreateEventStore((s) => s.step);
  const next = useCreateEventStore((s) => s.next);
  const activity = useCreateEventStore((s) => s.activity);
  const title = useCreateEventStore((s) => s.title);
  const startDate = useCreateEventStore((s) => s.startDate);

  const last = step === STEP_COUNT - 1;
  return (
    <Button
      variant="primary"
      label={last ? 'Host event' : 'Next'}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (last) onHost();
        else next();
      }}
      disabled={!canAdvanceFrom(step, { activity, title, startDate })}
    />
  );
});

// The wizard pane: the chrome around whichever step is showing.
//
// Every step below takes no props, so they are all `memo`-stable — a re-render
// of this card (a step change) does not reach into the step that is already
// mounted, and a field change inside a step does not reach out here.
export const CreateCard = memo(function CreateCard({
  restored,
  onStartFresh,
  onExit,
  onHost,
}: {
  restored: boolean;
  onStartFresh: () => void;
  onExit: () => void;
  onHost: () => void;
}) {
  const phase = useCreateEventStore((s) => s.phase);
  const step = useCreateEventStore((s) => s.step);
  const back = useCreateEventStore((s) => s.back);
  const setCardH = useCreateEventStore((s) => s.setCardH);

  // The phase check is *inside* the KeyboardAvoidingView, not around this whole
  // component. Reanimated needs a mounted parent to hold an exiting view while
  // it animates; unmounting the wrapper too makes the card vanish instead of
  // sliding away, which is what submit would have looked like.
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.cardWrap}
      pointerEvents="box-none"
    >
      {phase !== 'form' ? null : (
        <Animated.View
          entering={SlideInDown.duration(380).easing(Easing.out(Easing.cubic))}
          exiting={SlideOutDown.duration(280).easing(Easing.in(Easing.cubic))}
        >
          {/* Solid, not glass. A translucent pane takes the colour of whatever it
            is over, and over a map that is a different colour every time you
            pan — which is what read as "orange here, grey there". Going to
            `chrome` only reduced it. The card is opaque white now, matching the
            page surfaces elsewhere; it keeps the bright top edge and the
            rounded top corners, and gives up the blur. That is the trade: a
            stable colour or a see-through one.

            Only the top corners round: the card runs off the bottom of the
            screen, where a corner would read as the surface stopping short. */}
          <View
            style={styles.card}
            onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
          >
            <View style={styles.cardBody}>
              {/* Glyph and title on one line. Bare glyph, no chip — AGENTS.md
                assigns back/close/dismiss to NavButton, and its default colour
                is already the ink this pane wants. Step 0 has nothing to go
                back to, so it carries the close. */}
              <View style={styles.titleRow}>
                <NavButton
                  icon={step > 0 ? 'back' : 'close'}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (step > 0) back();
                    else onExit();
                  }}
                  accessibilityLabel={
                    step > 0 ? 'Previous step' : 'Cancel event creation'
                  }
                  style={styles.navSlot}
                />
                <Text style={styles.stepTitle} numberOfLines={1}>
                  {STEP_HEADS[step]}
                </Text>
              </View>
              <StepProgress step={step} />
              {/* A form that fills itself in is alarming without a reason. Sits
                above the steps so it reads before the fields do, and offers the
                way out in the same breath. */}
              {restored && (
                <Animated.View
                  entering={FadeIn.duration(220)}
                  style={styles.restoredRow}
                >
                  <Text style={styles.restoredText}>
                    Picked up where you left off
                  </Text>
                  <PressableScale
                    scaleTo={TAP_SCALE}
                    onPress={onStartFresh}
                    accessibilityRole="button"
                    accessibilityLabel="Start a fresh event"
                    hitSlop={8}
                  >
                    <Text style={styles.restoredAction}>Start fresh</Text>
                  </PressableScale>
                </Animated.View>
              )}
              {/* Steps (absolute-fill so enter/exit slides overlap cleanly) */}
              <View style={styles.stepArea}>
                {step === 0 && <StepType key="s0" />}
                {step === 1 && <StepDetails key="s1" />}
                {step === 2 && <StepWhen key="s2" />}
                {step === 3 && <StepPhoto key="s3" />}
                {step === 4 && <StepSafety key="s4" />}
              </View>

              <AdvanceButton onHost={onHost} />
            </View>
          </View>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  cardWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  // The shadow throws upward: SHADOWS.glass throws down, and this card's only
  // exposed edge is its top.
  card: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderColor: COLORS.glassBorder,
    paddingBottom: SPACING[7],
    shadowColor: COLORS.ink,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    marginTop: SPACING[1],
    marginBottom: SPACING[2],
  },
  // Pulled left so the glyph's optical edge lines up with the content column
  // below it rather than with its own 40pt touch box.
  navSlot: { marginLeft: -SPACING[2.5] },
  cardBody: { paddingHorizontal: SPACING[5], paddingTop: SPACING[2] },
  // Fixed height so the card does not resize between steps. It was 268, which
  // the when-step overran — the people row was being cut off by the Next button
  // sitting under it.
  stepArea: { height: 316, marginBottom: SPACING[3] },
  // Ordinary content now rather than a label on a dark band: left-aligned and
  // ink, sharing the glyph's line.
  stepTitle: {
    flex: 1,
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.sectionLg,
    color: COLORS.textPrimary,
  },
  restoredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[2],
    marginBottom: SPACING[3],
  },
  restoredText: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
  },
  restoredAction: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.primary,
  },
});
