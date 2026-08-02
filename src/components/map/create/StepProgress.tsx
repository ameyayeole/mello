import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { SPACING } from '@/constants/spacing';
import { STEP_COUNT } from '@/utils/eventDraft';

// Progress across the card, under the title row. It replaced a ring in a dark
// heading sheet, which went when the sheet did. Still animated for the reason
// the ring was: the fill moving is the main "you just finished that" feedback,
// and a bar that snapped between fifths would read as a redraw.
//
// 4pt, not 2. At 2 it read as a rendering artefact rather than as an element.
const PROGRESS_H = 4;

export function StepProgress({ step }: { step: number }) {
  const pct = useSharedValue((step + 1) / STEP_COUNT);

  useEffect(() => {
    pct.value = withTiming((step + 1) / STEP_COUNT, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });
  }, [step, pct]);

  const fill = useAnimatedStyle(() => ({ width: `${pct.value * 100}%` }));

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Below the title row rather than in the card's top edge. That is where it
  // belongs — it describes the step you are reading, not the pane — and it also
  // retires the corner problem entirely: away from the radius there is no curve
  // to follow, so the bar is just a bar with rounded ends.
  progressTrack: {
    height: PROGRESS_H,
    borderRadius: PROGRESS_H / 2,
    backgroundColor: COLORS.inkFaint,
    overflow: 'hidden',
    marginBottom: SPACING[3],
  },
  progressFill: {
    height: PROGRESS_H,
    borderRadius: PROGRESS_H / 2,
    backgroundColor: COLORS.primary,
  },
});
