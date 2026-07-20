import { useEffect, useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { CATEGORY_STYLE } from '@/constants/categoryStyle';
import { Icon } from '@/components/ui';
import { Stage, MapPanel, FloatingCard } from '../Stage';

// The emoji inside the fixed pin swaps calmly, the way it does in the real
// create flow when you change the plan type.
const PIN_EMOJIS = ['☕', '🎵', '🎉'];

// Slide 2: the in-map create flow. The white pin stays fixed while the map
// drifts underneath it; the wizard card floats below.
export function CreateScene() {
  const [emojiIndex, setEmojiIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setEmojiIndex((i) => (i + 1) % PIN_EMOJIS.length);
    }, 2800);
    return () => clearInterval(t);
  }, []);

  // A gentle settle after the pin appears; no bouncing.
  const settle = useSharedValue(0);
  useEffect(() => {
    settle.value = withDelay(
      500,
      withSequence(
        withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 320, easing: Easing.inOut(Easing.quad) })
      )
    );
  }, [settle]);
  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * settle.value }],
  }));

  const coffee = CATEGORY_STYLE.coffee;
  const music = CATEGORY_STYLE.music;

  return (
    <Stage>
      <View style={styles.center}>
        <MapPanel panning style={styles.panel}>
          <Animated.View
            entering={FadeInDown.delay(250).duration(400)}
            style={styles.promptPill}
          >
            <Icon name="pin" size={14} color={COLORS.primary} />
            <Text style={styles.promptText}>Tap anywhere to drop a pin</Text>
          </Animated.View>

          <View style={styles.pinColumn}>
            <Animated.View
              entering={ZoomIn.delay(450).duration(300).easing(Easing.out(Easing.cubic))}
              style={pinStyle}
            >
              <View style={styles.pinCircle}>
                <Animated.Text
                  key={PIN_EMOJIS[emojiIndex]}
                  entering={ZoomIn.duration(220).easing(Easing.out(Easing.cubic))}
                  style={styles.pinEmoji}
                >
                  {PIN_EMOJIS[emojiIndex]}
                </Animated.Text>
              </View>
            </Animated.View>
            <View style={styles.groundShadow} />
          </View>
        </MapPanel>

        <FloatingCard delay={700} float={4} style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>New plan</Text>
          <View style={styles.chipRow}>
            <View style={[styles.chip, { backgroundColor: coffee.tint }]}>
              <Icon name="coffee" size={14} color={coffee.accent} />
              <Text style={[styles.chipText, { color: coffee.accent }]}>Coffee</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: music.tint }]}>
              <Icon name="music" size={14} color={music.accent} />
              <Text style={[styles.chipText, { color: music.accent }]}>Music</Text>
            </View>
            <View style={styles.chipGhost}>
              <Text style={styles.chipGhostText}>+6</Text>
            </View>
          </View>
          <View style={styles.sheetButton}>
            <Icon name="pin" size={15} color="#fff" strokeWidth={2.2} />
            <Text style={styles.sheetButtonText}>Drop pin here</Text>
          </View>
        </FloatingCard>
      </View>
    </Stage>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: {
    width: '76%',
    height: '78%',
    maxWidth: 330,
  },
  promptPill: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    paddingHorizontal: SPACING[3],
    height: 34,
    borderRadius: RADIUS.full,
    backgroundColor: '#fff',
    shadowColor: '#0F182C',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  promptText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textPrimary,
  },
  pinColumn: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 72,
  },
  pinCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#0F182C',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  pinEmoji: { fontSize: TYPE_SIZE.titleLg, lineHeight: 33 },
  groundShadow: {
    marginTop: SPACING[1],
    width: 18,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(15,24,44,0.16)',
  },
  sheet: {
    position: 'absolute',
    bottom: '9%',
    width: '74%',
    maxWidth: 300,
    padding: SPACING[4],
    paddingTop: SPACING[2.5],
    alignItems: 'stretch',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(15,24,44,0.12)',
    marginBottom: SPACING[2.5],
  },
  sheetTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.body,
    letterSpacing: -0.3,
    color: COLORS.textPrimary,
  },
  chipRow: { flexDirection: 'row', gap: SPACING[1.5], marginTop: SPACING[2.5] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    paddingHorizontal: SPACING[2.5],
    height: 28,
    borderRadius: RADIUS.full,
  },
  chipText: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.micro },
  chipGhost: {
    paddingHorizontal: SPACING[2.5],
    height: 28,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipGhostText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
  },
  sheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[1.5],
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    marginTop: SPACING[3],
  },
  sheetButtonText: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.bodySm, color: '#fff' },
});
