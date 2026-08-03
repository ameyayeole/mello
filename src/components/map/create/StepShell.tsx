import { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOut } from 'react-native-reanimated';

// The frame every wizard step sits in: absolutely filled so an outgoing step
// and an incoming one can overlap without the card resizing between them, and
// carrying the shared enter/exit.
//
// Steps come in on a short rise as well as a fade. A pure cross-fade at 150/80
// was the most abrupt thing left in the flow — content simply replaced itself,
// with nothing to say a step had been completed. The durations are longer and
// the exit is quicker than the entrance, so the outgoing step is gone before
// the incoming one is legible and the two never read as overlapping.
//
// Module scope, not a render body: these are builder objects, and rebuilding
// them per render hands Reanimated a new animation identity every time.
const ENTERING = FadeInDown.duration(260)
  .easing(Easing.out(Easing.cubic))
  .withInitialValues({ transform: [{ translateY: 14 }] });
const EXITING = FadeOut.duration(120).easing(Easing.in(Easing.quad));

export function StepShell({ children }: { children: ReactNode }) {
  return (
    <Animated.View entering={ENTERING} exiting={EXITING} style={styles.step}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  step: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
