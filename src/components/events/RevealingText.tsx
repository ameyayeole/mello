// src/components/events/RevealingText.tsx
import { useState, useCallback } from 'react';
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
import { useEnterOnScroll } from './useEnterOnScroll';
import { clampVisibleLineCount } from '@/utils/textLines';

// A block of text that shows only as many lines as fit above a fixed
// boundary, then reveals the rest one line at a time — Fade + Rise, same
// motion `GoingRow` uses — the instant each hidden line clears that boundary
// on scroll. Built for the event sheet's description, where the boundary is
// the pinned CTA footer's top edge, so extra lines read as emerging from
// behind it rather than from the bottom of the screen.
//
// RN lays a `Text` out as one block, so line-splitting needs a real measure:
// a hidden copy of the FULL text (opacity 0, absolutely positioned so it
// doesn't affect layout) is measured via `onTextLayout`, which gives both
// the per-line substrings and the line height. The visible lines render as
// plain Text elements; all hidden lines mount immediately as RevealingLine
// components (animated via opacity/translateY only). So the container's
// height is fixed to the full text's height from the first frame, not growing
// as lines reveal — only their visibility animates on scroll.
export function RevealingText({
  text,
  style,
  availableHeight,
  offset,
  heroGrow,
  sheetProgress,
  footerBoundary,
  onLayout,
  onVisibleLayout,
}: {
  text: string;
  style: TextStyle;
  // Vertical space above the boundary available to the initially-visible
  // lines — the caller derives this from its own layout (see
  // EventBottomSheet.tsx's description clamp calc in Task 7).
  availableHeight: number;
  offset: number;
  heroGrow: number;
  sheetProgress: SharedValue<number>;
  footerBoundary: number;
  onLayout?: (e: LayoutChangeEvent) => void;
  // The initially-visible lines' own height — distinct from this
  // component's overall onLayout, which reports the FULL block including
  // hidden lines reserved below the fold. Callers sizing a resting stop
  // around "what's visible before any scroll" need this one instead.
  onVisibleLayout?: (e: LayoutChangeEvent) => void;
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
      setLineHeight((prev) => (prev === measured[0].height ? prev : measured[0].height));
    },
    []
  );

  const visibleCount =
    lines && lineHeight != null
      ? clampVisibleLineCount(availableHeight, lineHeight, lines.length)
      : null;

  return (
    <View onLayout={onLayout}>
      <Text
        style={[style, styles.measuring]}
        onTextLayout={handleTextLayout}
        pointerEvents="none"
      >
        {text}
      </Text>

      {/* Nothing renders until the measure pass completes — one frame of
          "no description" reads better than one frame of the wrong amount
          of it. */}
      {lines && visibleCount != null && (
        <View>
          <View onLayout={onVisibleLayout}>
            {lines.slice(0, visibleCount).map((line, i) => {
              const truncated = visibleCount < lines.length && i === visibleCount - 1;
              return (
                <Text key={i} style={style} numberOfLines={1} ellipsizeMode="tail">
                  {truncated ? `${line.trimEnd()}…` : line}
                </Text>
              );
            })}
          </View>
          {lines.slice(visibleCount).map((line, i) => (
            <RevealingLine
              key={visibleCount + i}
              text={line}
              style={style}
              offset={offset}
              heroGrow={heroGrow}
              sheetProgress={sheetProgress}
              footerBoundary={footerBoundary}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// One hidden-then-revealed line. Needs its own onLayout — a position shared
// across the whole hidden block would fire every line's entrance at once
// instead of one at a time as the user scrolls.
function RevealingLine({
  text,
  style,
  offset,
  heroGrow,
  sheetProgress,
  footerBoundary,
}: {
  text: string;
  style: TextStyle;
  offset: number;
  heroGrow: number;
  sheetProgress: SharedValue<number>;
  footerBoundary: number;
}) {
  const [box, setBox] = useState<{ y: number; h: number } | null>(null);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { y, height: h } = e.nativeEvent.layout;
    setBox((prev) => (prev?.y === y && prev?.h === h ? prev : { y, h }));
  }, []);

  const entrance = useEnterOnScroll({
    offset,
    slide: heroGrow,
    sheetProgress,
    boundary: footerBoundary,
    y: box?.y ?? null,
    h: box?.h ?? null,
  });

  const lineStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: interpolate(entrance.value, [0, 1], [8, 0], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <Animated.View onLayout={handleLayout} style={lineStyle}>
      <Text style={style}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  measuring: { position: 'absolute', left: 0, right: 0, opacity: 0 },
});
