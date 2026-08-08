import { memo, useEffect } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { COLORS } from '@/constants/colors';
import { RADIUS, SPACING } from '@/constants/spacing';
import { Icon, PressableScale } from '@/components/ui';
import { themedStyles } from '@/theme';

// Five 4:5 frames, centre-locked, with the next one peeking past the edge.
//
// The ratio is fixed rather than free because every surface downstream — the
// wrap grid, a shared_wrap card's top_photos, the recap — inherits whatever
// shape lands here. Allow mixed ratios and each of those has to decide how to
// crop, independently, later.
//
// This takes props, unlike a step: it is a leaf presentational component. The
// no-props rule in AGENTS.md is about the flow's steps, which is where memo
// has to hold against store churn.
const GAP = SPACING[3];

export const PhotoCarousel = memo(function PhotoCarousel({
  uris,
  index,
  onIndexChange,
  onPick,
}: {
  uris: (string | null)[];
  index: number;
  onIndexChange: (i: number) => void;
  onPick: (i: number) => void;
}) {
  const { width } = useWindowDimensions();
  // The frame is 4:5, sized so a slice of the next one stays on screen. 0.62 is
  // a layout number, not a token — it is "wide enough to be the subject, narrow
  // enough that the neighbour reads as swipeable".
  const W = Math.round(width * 0.62);
  const H = Math.round(W * 1.25);
  const STRIDE = W + GAP;
  const REST = (width - W) / 2;

  const tx = useSharedValue(0);
  const start = useSharedValue(0);

  // Keeps the track in step with an index changed from outside the gesture —
  // tapping a neighbour, or the store being reset. Without this the frames
  // would stay where the last drag left them while `index` said otherwise.
  useEffect(() => {
    tx.value = withSpring(-index * STRIDE, { damping: 18, stiffness: 160 });
  }, [index, STRIDE, tx]);

  const pan = Gesture.Pan()
    .onBegin(() => {
      start.value = tx.value;
    })
    .onUpdate((e) => {
      tx.value = start.value + e.translationX;
    })
    .onEnd((e) => {
      const moved = -(tx.value - start.value);
      const flung = Math.abs(moved) > W * 0.25 || Math.abs(e.velocityX) > 600;
      const dir = moved > 0 ? 1 : -1;
      const nextIndex = Math.max(
        0,
        Math.min(uris.length - 1, index + (flung ? dir : 0))
      );
      tx.value = withSpring(-nextIndex * STRIDE, {
        damping: 18,
        stiffness: 160,
      });
      if (nextIndex !== index) runOnJS(onIndexChange)(nextIndex);
    });

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value + REST }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.track, trackStyle, { gap: GAP }]}>
        {uris.map((uri, i) => (
          <PressableScale
            key={i}
            scaleTo={0.98}
            onPress={() => (i === index ? onPick(i) : onIndexChange(i))}
            style={[
              styles.slide,
              { width: W, height: H },
              i !== index && styles.slideOff,
            ]}
            accessibilityRole="button"
            accessibilityLabel={uri ? `Photo ${i + 1}` : `Add photo ${i + 1}`}
          >
            {uri ? (
              <Image source={{ uri }} style={styles.img} contentFit="cover" />
            ) : (
              <View style={styles.empty}>
                <Icon name="galleryAdd" size={30} color={COLORS.primary} />
              </View>
            )}
          </PressableScale>
        ))}
      </Animated.View>
    </GestureDetector>
  );
});

const styles = themedStyles(() => ({
  track: { flexDirection: 'row', alignItems: 'center' },
  slide: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  slideOff: { opacity: 0.45 },
  img: { width: '100%', height: '100%' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
}));
