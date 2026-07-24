// src/components/events/RevealingText.tsx
import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
  type TextStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { useBottomSheetInternal } from '@gorhom/bottom-sheet';
import { clampVisibleLineCount } from '@/utils/textLines';

// How many points of scroll a line fades over as it clears the pinned action's
// top edge. Kept under a line's height so lines resolve roughly one at a time,
// which reads as a line-by-line reveal rather than the whole block fading.
const REVEAL_BAND = 18;
// The rise each line travels as it fades in — the "+ rise" half of fade + rise.
const REVEAL_RISE = 6;

// A block of text whose lines fade in as they clear a fixed screen line (the
// pinned action's top edge) and fade back out as they drop below it again. The
// reveal is driven CONTINUOUSLY by each line's live position — not a one-shot
// timed animation — so it is fully reversible: scroll back down and the lines
// that were behind the action are hidden again rather than left showing through
// it. Every line reserves its full height in flow from the first frame (opacity
// never removes it from layout), so the block's height is fixed and whatever
// follows it stays parked below until the action releases.
//
// RN lays a `Text` out as one block, so line-splitting needs a real measure: a
// hidden copy of the full text (opacity 0, absolutely positioned so it doesn't
// affect layout) is measured via `onTextLayout`, which gives the per-line
// substrings and the line height.
export function RevealingText({
  text,
  style,
  availableHeight,
  maxLines,
  offset,
  heroGrow,
  sheetProgress,
  footerBoundary,
  onLayout,
  onVisibleHeight,
}: {
  text: string;
  style: TextStyle;
  // Vertical space above the boundary at the resting stop — used only to size
  // the resting stop (how many lines sit above the action before any scroll),
  // reported back via `onVisibleHeight`. Not a render clamp: every line is
  // rendered; position decides what shows.
  availableHeight: number;
  // A hard ceiling on how many lines show at rest, independent of screen size —
  // so the resting view is predictable on every device (a tall screen doesn't
  // spill six lines above the action). The rest reveal on scroll.
  maxLines: number;
  offset: number;
  heroGrow: number;
  sheetProgress: SharedValue<number>;
  footerBoundary: number;
  onLayout?: (e: LayoutChangeEvent) => void;
  // The height of the lines that sit above the action at rest
  // (visibleCount × lineHeight) — the caller sizes the resting stop off this
  // rather than off the block's full (mostly-below-the-fold) height.
  onVisibleHeight?: (height: number) => void;
}) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [lineHeight, setLineHeight] = useState<number | null>(null);

  const handleTextLayout = useCallback(
    (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      const measured = e.nativeEvent.lines;
      if (measured.length === 0) return;
      const next = measured.map((l) => l.text);
      setLines((prev) =>
        prev && prev.length === next.length && prev.every((t, i) => t === next[i])
          ? prev
          : next
      );
      setLineHeight((prev) =>
        prev === measured[0].height ? prev : measured[0].height
      );
    },
    []
  );

  // How many lines sit above the action at the resting stop — reported up so
  // the sheet can size its resting height to exactly that, never to the full
  // (mostly hidden) block.
  const visibleCount =
    lines && lineHeight != null
      ? Math.min(
          clampVisibleLineCount(availableHeight, lineHeight, lines.length),
          maxLines
        )
      : null;
  useEffect(() => {
    if (visibleCount != null && lineHeight != null) {
      onVisibleHeight?.(visibleCount * lineHeight);
    }
  }, [visibleCount, lineHeight, onVisibleHeight]);

  return (
    <View onLayout={onLayout}>
      <Text
        style={[style, styles.measuring]}
        onTextLayout={handleTextLayout}
        pointerEvents="none"
      >
        {text}
      </Text>

      {/* Nothing renders until the measure pass completes — one frame of "no
          description" reads better than one frame of the wrong amount of it. */}
      {lines && (
        <View>
          {lines.map((line, i) => (
            <RevealingLine
              key={i}
              text={line}
              style={style}
              offset={offset}
              heroGrow={heroGrow}
              sheetProgress={sheetProgress}
              boundary={footerBoundary}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// One line, its opacity and rise tracking its live distance above the boundary.
// Needs its own onLayout — each line's position is what decides when it shows,
// so they resolve one at a time as the content scrolls rather than all at once.
function RevealingLine({
  text,
  style,
  offset,
  heroGrow,
  sheetProgress,
  boundary,
}: {
  text: string;
  style: TextStyle;
  offset: number;
  heroGrow: number;
  sheetProgress: SharedValue<number>;
  boundary: number;
}) {
  const { animatedPosition, animatedScrollableState } = useBottomSheetInternal();
  const [y, setY] = useState<number | null>(null);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const ly = e.nativeEvent.layout.y;
    setY((prev) => (prev === ly ? prev : ly));
  }, []);

  const lineStyle = useAnimatedStyle(() => {
    if (y == null) return { opacity: 0 };
    const slide = interpolate(
      sheetProgress.value,
      [0, 1],
      [0, heroGrow],
      Extrapolation.CLAMP
    );
    const top =
      animatedPosition.value +
      offset +
      slide +
      y -
      animatedScrollableState.value.contentOffsetY;
    // 1 once the line has cleared the boundary by a band, 0 while it's still at
    // or below it (behind / under the pinned action). Reversible: scrolling
    // back down runs it straight back to 0.
    const progress = interpolate(
      top,
      [boundary - REVEAL_BAND, boundary],
      [1, 0],
      Extrapolation.CLAMP
    );
    return {
      opacity: progress,
      transform: [
        {
          translateY: interpolate(
            progress,
            [0, 1],
            [REVEAL_RISE, 0],
            Extrapolation.CLAMP
          ),
        },
      ],
    };
  });

  return (
    <Animated.View onLayout={handleLayout} style={lineStyle}>
      <Text style={style}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  measuring: { position: 'absolute', left: 0, right: 0, opacity: 0 },
});
