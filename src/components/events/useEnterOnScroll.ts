import {
  useSharedValue,
  useDerivedValue,
  useAnimatedReaction,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { useBottomSheetInternal } from '@gorhom/bottom-sheet';

// Drives a one-shot 0->1 entrance the instant an element clears a
// screen-space boundary, then times it to completion — position decides
// WHEN, a fixed duration decides HOW LONG.
//
// Keying this to the sheet's own snap progress instead fires everything
// below the fold before it's ever seen; scrubbing progress directly from
// live position instead freezes anything straddling the boundary mid-slide,
// half-arrived. Both were tried on the who's-going rows this was extracted
// from — see EventBottomSheet.tsx's GoingRow for the fuller account.
//
// Generic over what "arrived" means: who's-going rows arrive at the screen's
// bottom edge (`boundary: screenH`); description lines arrive at the pinned
// CTA footer's top edge instead, so they read as emerging from behind it
// rather than from the bottom of the screen.
export function useEnterOnScroll({
  offset,
  slide,
  sheetProgress,
  boundary,
  y,
  h,
  durationMs = 420,
}: {
  // Fixed vertical offset from the sheet's own top to this element's
  // container — e.g. BANNER_H + the going card's y, or BANNER_H + the
  // description block's y.
  offset: number;
  // How far this element's container slides as `sheetProgress` runs 0->1
  // (the content card's translateY range — `heroGrow` in EventBottomSheet).
  slide: number;
  sheetProgress: SharedValue<number>;
  // Screen-space y beyond which the element counts as arrived.
  boundary: number;
  // This element's own layout position within its offset container —
  // null until the caller has measured it via onLayout.
  y: number | null;
  h: number | null;
  durationMs?: number;
}): SharedValue<number> {
  const { animatedPosition, animatedScrollableState } = useBottomSheetInternal();
  const played = useSharedValue(0);

  const arrived = useDerivedValue(() => {
    if (y == null || h == null) return false;
    const slideNow = interpolate(
      sheetProgress.value,
      [0, 1],
      [0, slide],
      Extrapolation.CLAMP
    );
    const top =
      animatedPosition.value +
      offset +
      slideNow +
      y -
      animatedScrollableState.value.contentOffsetY;
    return top < boundary;
  });

  useAnimatedReaction(
    () => arrived.value,
    (isArrived) => {
      // `=== 0` rather than `< 1` so a run already underway is never
      // restarted mid-flight by a frame that re-reads as arrived.
      if (isArrived && played.value === 0) {
        played.value = withTiming(1, {
          duration: durationMs,
          easing: Easing.out(Easing.cubic),
        });
      }
    }
  );

  return played;
}
