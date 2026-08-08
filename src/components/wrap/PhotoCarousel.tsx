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

// The photos you are adding, one 4:5 frame at a time, with the next one peeking
// past the edge.
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

// How much of the finger's travel the track actually takes.
//
// At 1:1 a normal thumb flick threw the strip two or three frames and it read
// as loose — you aimed at the next photo and landed somewhere past it. Damped,
// the strip follows your finger a little behind, which is what makes it feel
// like it has weight instead of ice under it.
const DRAG_FACTOR = 0.55;

// Travel past the first or last frame, before resistance. Without a cap the
// strip could be dragged into empty space and sprung back from it.
const OVERSCROLL = 48;

export const PhotoCarousel = memo(function PhotoCarousel({
  uris,
  index,
  onIndexChange,
  onDelete,
}: {
  uris: string[];
  index: number;
  onIndexChange: (i: number) => void;
  onDelete?: (i: number) => void;
}) {
  const { width } = useWindowDimensions();
  // 0.78 of the screen, up from 0.62 — the photo is the subject of this step,
  // and at the smaller size it read as a thumbnail with furniture around it.
  // Still short of full width, because the slice of the next frame is what
  // says the strip is swipeable without an instruction.
  const W = Math.round(width * 0.78);
  const H = Math.round(W * 1.25);
  const STRIDE = W + GAP;
  const REST = (width - W) / 2;

  const tx = useSharedValue(0);
  const start = useSharedValue(0);
  const maxIndex = Math.max(0, uris.length - 1);

  // Keeps the track in step with an index changed from outside the gesture —
  // adding a photo, or the store being reset. Without this the frames would
  // stay where the last drag left them while `index` said otherwise.
  useEffect(() => {
    tx.value = withSpring(-index * STRIDE, { damping: 22, stiffness: 170 });
  }, [index, STRIDE, tx]);

  const pan = Gesture.Pan()
    // Vertical drags belong to the scroll view this sits inside.
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      start.value = tx.value;
    })
    .onUpdate((e) => {
      const next = start.value + e.translationX * DRAG_FACTOR;
      const min = -maxIndex * STRIDE - OVERSCROLL;
      tx.value = Math.max(min, Math.min(OVERSCROLL, next));
    })
    .onEnd((e) => {
      const moved = -(tx.value - start.value);
      // One frame per gesture, whatever the distance — the old rule let a hard
      // flick commit and the spring carry on past its target.
      const flung = Math.abs(moved) > W * 0.18 || Math.abs(e.velocityX) > 500;
      const dir = moved > 0 ? 1 : -1;
      const nextIndex = Math.max(
        0,
        Math.min(maxIndex, index + (flung ? dir : 0))
      );
      // Damping well above the usual 18: this strip should arrive and stop.
      // A visible overshoot on a photo the size of the screen reads as a bounce.
      tx.value = withSpring(-nextIndex * STRIDE, {
        damping: 22,
        stiffness: 170,
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
          <View
            key={`${uri}-${i}`}
            style={[styles.slide, { width: W, height: H }, i !== index && styles.slideOff]}
          >
            <Image source={{ uri }} style={styles.img} contentFit="cover" />
            {onDelete && i === index ? (
              <PressableScale
                scaleTo={0.9}
                style={styles.trash}
                hitSlop={10}
                onPress={() => onDelete(i)}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${i + 1}`}
              >
                <Icon name="trash" size={16} color={COLORS.white} strokeWidth={2.2} />
              </PressableScale>
            ) : null}
          </View>
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
  // Only on the centred frame: a trash button on a photo you have not chosen
  // yet is an invitation to delete the wrong one.
  trash: {
    position: 'absolute',
    top: SPACING[2.5],
    right: SPACING[2.5],
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.scrimOnPhoto,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
