// src/components/events/RevealingText.tsx
import { useCallback } from 'react';
import {
  View,
  Text,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
  type TextStyle,
} from 'react-native';

// The event description, rendered in full and in normal flow — every line is
// always present and readable. At the resting stop only the first few lines
// clear the pinned action; the rest sit behind / below it (covered by the
// action's opaque skirt), and expanding the sheet and scrolling brings them up
// from behind the action. So the "reveal" is simply the text scrolling out from
// under the action — robust in a way the old per-line opacity scrub was not: no
// line can get stuck invisible, and nothing caps how far you can scroll.
//
// It measures its own line count and line height via `onTextLayout` and reports
// the height of the first `maxLines` back up, so the sheet can size its resting
// stop to exactly that many lines above the action.
export function RevealingText({
  text,
  style,
  maxLines,
  onLayout,
  onVisibleHeight,
}: {
  text: string;
  style: TextStyle;
  // How many lines sit above the action at the resting stop — reported (× line
  // height) via `onVisibleHeight` so the resting stop is sized to exactly that.
  maxLines: number;
  onLayout?: (e: LayoutChangeEvent) => void;
  onVisibleHeight?: (height: number) => void;
}) {
  const handleTextLayout = useCallback(
    (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      const measured = e.nativeEvent.lines;
      if (measured.length === 0) return;
      const lineHeight = measured[0].height;
      const visible = Math.min(measured.length, maxLines);
      onVisibleHeight?.(visible * lineHeight);
    },
    [maxLines, onVisibleHeight]
  );

  return (
    <View onLayout={onLayout}>
      <Text style={style} onTextLayout={handleTextLayout}>
        {text}
      </Text>
    </View>
  );
}
