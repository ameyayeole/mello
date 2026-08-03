import { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { RADIUS, SPACING } from '@/constants/spacing';
import { ActivityId } from '@/types/models';
import { GLIDE, SQUASH, TAP_SCALE } from './motion';

// Columns in the grid, and the emoji plate the indicator is sized to. Both have
// to agree with the layout below.
const GRID_COLS = 4;
const TILE = 58;

// Memoised because it is 52 tiles hanging off a component that re-renders for
// reasons that have nothing to do with the grid. Measured at 9 renders — 468
// tile renders — for one map pan, none of which changed a single activity.
// The props are already stable: `onChange` is a setState, `value` a primitive,
// and `activities` is memoised by the caller.
export const TypeGrid = memo(function TypeGrid({
  activities,
  value,
  onChange,
}: {
  activities: { id: ActivityId; emoji: string; label: string }[];
  value: ActivityId | null;
  onChange: (id: ActivityId) => void;
}) {
  const [frames, setFrames] = useState<
    Record<string, { x: number; y: number; w: number }>
  >({});
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const shown = useSharedValue(0);
  // 0 at rest, 1 mid-travel.
  const squash = useSharedValue(0);
  const placed = useRef(false);
  const prevIndex = useRef<number | null>(null);

  const index = value ? activities.findIndex((a) => a.id === value) : -1;
  const frame = value ? frames[value] : undefined;

  useEffect(() => {
    if (!frame || index < 0) {
      shown.value = withTiming(0, { duration: 120 });
      prevIndex.current = null;
      placed.current = false;
      return;
    }
    const tx = frame.x + (frame.w - TILE) / 2;
    const ty = frame.y;
    shown.value = withTiming(1, { duration: 140 });

    const from = prevIndex.current;
    prevIndex.current = index;
    // First placement, or arriving from nothing: no travel to animate.
    if (!placed.current || from === null) {
      placed.current = true;
      x.value = tx;
      y.value = ty;
      return;
    }

    // Straight to the target, both axes together. An earlier version stepped
    // the axes to avoid "crossing cells that were never on the way" — but the
    // indicator is a thing moving over the grid, not a token walking through
    // it, and the diagonal is simply where it is going.
    squash.value = withSequence(
      withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
      withSpring(0, GLIDE)
    );
    x.value = withSpring(tx, GLIDE);
    y.value = withSpring(ty, GLIDE);
  }, [frame, index, x, y, shown, squash]);

  const indicator = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: 1 - squash.value * SQUASH },
    ],
    opacity: shown.value,
  }));

  return (
    <View style={styles.typeGrid}>
      {/* Behind the tiles, so it can never take a tap. */}
      <Animated.View
        style={[styles.typeIndicator, indicator]}
        pointerEvents="none"
      />
      {activities.map((a) => {
        const sel = value === a.id;
        return (
          <PressableScale
            key={a.id}
            scaleTo={TAP_SCALE}
            style={styles.typeItem}
            // Synchronously — React nulls nativeEvent once the handler returns.
            onLayout={(e) => {
              const { x: px, y: py, width } = e.nativeEvent.layout;
              setFrames((f) =>
                f[a.id]?.x === px && f[a.id]?.y === py
                  ? f
                  : { ...f, [a.id]: { x: px, y: py, w: width } }
              );
            }}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(a.id);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
          >
            <View style={styles.typeTile}>
              <Text style={styles.typeEmoji}>{a.emoji}</Text>
            </View>
            <Text
              style={[styles.typeLabel, sel && styles.typeLabelOn]}
              numberOfLines={1}
            >
              {a.label}
            </Text>
          </PressableScale>
        );
      })}
      {/* Keeps a short last row left-aligned under space-between instead of
          spreading it out. */}
      {Array.from({
        length: (GRID_COLS - (activities.length % GRID_COLS)) % GRID_COLS,
      }).map((_, i) => (
        <View key={`spacer-${i}`} style={styles.typeItem} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: SPACING[3.5],
  },
  typeItem: { width: '23%', alignItems: 'center', gap: SPACING[1.5] },
  // The travelling selection, sized to the emoji plate and sitting behind it.
  typeIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: TILE,
    height: TILE,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.inkFaint,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  // Bare emoji, no plate. Only the selected type gets a tinted container.
  typeTile: {
    width: TILE,
    height: TILE,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeEmoji: { fontSize: TYPE_SIZE.h1, lineHeight: 34 },
  typeLabel: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.inkLabel,
  },
  typeLabelOn: { fontFamily: FONTS.bold, color: COLORS.textPrimary },
});
