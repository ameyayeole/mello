import { memo, useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { PressableScale } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { RADIUS, SPACING } from '@/constants/spacing';
import { SectionId } from '@/constants/activities';
import { GLIDE , TAP_SCALE } from './motion';

// Memoised for the same reason as TypeGrid — it sits in the same step and rode
// along on every unrelated re-render of the flow. Its `sections` prop has to be
// a stable reference for this to bite, which is why the caller hoists it.
export const SectionPills = memo(function SectionPills({
  sections,
  value,
  onChange,
}: {
  sections: { id: SectionId | 'all'; label: string }[];
  value: SectionId | 'all';
  onChange: (id: SectionId | 'all') => void;
}) {
  const [frames, setFrames] = useState<Record<string, { x: number; w: number }>>(
    {}
  );
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  // The first measurement positions without animating, or the indicator flies
  // in from the left edge every time the step mounts.
  const placed = useRef(false);

  const frame = frames[value];
  useEffect(() => {
    if (!frame) return;
    if (!placed.current) {
      placed.current = true;
      x.value = frame.x;
      w.value = frame.w;
      return;
    }
    x.value = withSpring(frame.x, GLIDE);
    w.value = withSpring(frame.w, GLIDE);
  }, [frame, x, w]);

  const indicator = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: w.value,
  }));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.sectionPillRow}
      contentContainerStyle={styles.sectionPillContent}
    >
      {/* Behind the labels, so it can never intercept a tap. */}
      <Animated.View style={[styles.sectionIndicator, indicator]} />
      {sections.map((s) => {
        const sel = value === s.id;
        return (
          <PressableScale
            key={s.id}
            scaleTo={TAP_SCALE}
            style={styles.sectionPill}
            // Read out of the event synchronously. React pools synthetic
            // events and nulls `nativeEvent` once the handler returns, so
            // touching it inside the state updater — which runs later — throws
            // "Cannot read property 'layout' of null". The updater closes over
            // plain numbers instead.
            onLayout={(e) => {
              const { x: px, width } = e.nativeEvent.layout;
              setFrames((f) =>
                f[s.id]?.x === px && f[s.id]?.w === width
                  ? f
                  : { ...f, [s.id]: { x: px, w: width } }
              );
            }}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(s.id);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
          >
            <Text
              style={[styles.sectionPillText, sel && styles.sectionPillTextActive]}
            >
              {s.label}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
});

// The activity grid, with the same travelling selection as the category row.

const styles = StyleSheet.create({
  sectionPillRow: { flexGrow: 0, marginTop: SPACING[3], marginHorizontal: -20 },
  sectionPillContent: { paddingHorizontal: SPACING[5], gap: SPACING[2] },
  sectionPill: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: SPACING[3.5],
    borderRadius: RADIUS.full,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  // The travelling selection. Absolute inside the scroll content so it shares
  // the pills' coordinate space, and behind them so it cannot take a tap.
  sectionIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
  },
  sectionPillText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
  },
  sectionPillTextActive: { fontFamily: FONTS.bold, color: COLORS.white },
});
