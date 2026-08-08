import { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOut } from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { RADIUS, SPACING } from '@/constants/spacing';
import { themedStyles } from '@/theme';

// The frame every contribution step sits in. Copied in shape from
// map/create/StepShell.tsx: absolutely filled so an outgoing step and an
// incoming one overlap without the layout resizing between them.
//
// Module scope, not a render body — these are builder objects, and rebuilding
// them per render hands Reanimated a new animation identity every time.
const ENTERING = FadeInDown.duration(260)
  .easing(Easing.out(Easing.cubic))
  .withInitialValues({ transform: [{ translateY: 14 }] });
const EXITING = FadeOut.duration(120).easing(Easing.in(Easing.quad));

export function FlowProgress({ total, index }: { total: number; index: number }) {
  return (
    <View style={styles.rail}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i <= index && styles.dotOn]} />
      ))}
    </View>
  );
}

export function FlowShell({ children }: { children: ReactNode }) {
  return (
    <Animated.View entering={ENTERING} exiting={EXITING} style={styles.step}>
      {children}
    </Animated.View>
  );
}

// themedStyles, not a module-level StyleSheet.create: the rail's off state is
// COLORS.inkFaint, which is a dark ink wash in light mode and a white one in
// dark. Created at import time it would freeze whichever palette loaded first
// and the dots would vanish in the other theme. See theme.ts.
const styles = themedStyles(() => ({
  step: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 },
  rail: {
    flexDirection: 'row',
    gap: SPACING[1.5],
    justifyContent: 'center',
    paddingVertical: SPACING[3],
  },
  dot: {
    height: 3,
    width: 32,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.inkFaint,
  },
  dotOn: { backgroundColor: COLORS.primary },
}));
