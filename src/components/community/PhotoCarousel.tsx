import { useState } from 'react';
import { View, FlatList, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Glass } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';

// A photo post's media, as a paged square carousel. Chrome (index counter, dots)
// only appears for >1 photo and sits on the image via the `onPhoto` smoked-glass
// tier, so it stays legible over any picture (and over Android's flat fallback).
// Width is measured (onLayout) rather than derived from the window, because the
// card sits inside the feed's own padding — deriving it would drift.
export function PhotoCarousel({ media }: { media: string[] }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const multi = media.length > 1;

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <FlatList
          // Remount when the measured width lands so paging snaps to the real size.
          key={width}
          data={media}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            if (i !== index) {
              setIndex(i);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          }}
          renderItem={({ item }) => (
            <Image
              source={{ uri: item }}
              style={{ width, aspectRatio: 1 }}
              contentFit="cover"
              transition={180}
            />
          )}
        />
      ) : null}

      {multi ? (
        <>
          <Glass tier="onPhoto" radius={RADIUS.full} style={styles.counter}>
            <Text style={styles.counterText}>
              {index + 1}/{media.length}
            </Text>
          </Glass>
          <View style={styles.dots} pointerEvents="none">
            {media.map((uri, i) => (
              <View
                key={`${uri}-${i}`}
                style={[styles.dot, i === index && styles.dotActive]}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  counter: {
    position: 'absolute',
    top: SPACING[2.5],
    right: SPACING[2.5],
    paddingHorizontal: SPACING[2],
    paddingVertical: SPACING[0.5],
  },
  counterText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.white,
  },
  dots: {
    position: 'absolute',
    bottom: SPACING[2.5],
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING[1.5],
  },
  // Dot metrics are glyph-like one-offs (not tokens); the translucent white reads
  // on the onPhoto smoked glass and over Android's flat fallback.
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: { backgroundColor: COLORS.white, width: 7, height: 7, borderRadius: 3.5 },
});
