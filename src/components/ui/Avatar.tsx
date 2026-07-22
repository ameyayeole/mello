import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { VerifiedBadge } from './Icon';
import { PressableScale } from './PressableScale';

// Avatar per design system: photo, or initial on the brand gradient.
// Optional online dot (green, bg-colored ring) and verified check.
export function Avatar({
  name,
  photoUrl,
  size = 44,
  online = false,
  verified = false,
  ringColor,
  ringWidth = 2.5,
  onPress,
}: {
  name?: string | null;
  photoUrl?: string | null;
  size?: number;
  online?: boolean;
  verified?: boolean;
  ringColor?: string;
  // React Native borders are drawn *inside* the box, so the ring eats into the
  // photo rather than surrounding it. At 2.5 on a 22px bubble that is nearly a
  // quarter of the diameter and the face reads as cropped — small avatars want
  // a thinner one.
  ringWidth?: number;
  // A face that opens the person. Chat bubbles, the read-receipt rail and the
  // active-now row all want this; without it each was wrapping its own
  // pressable and picking its own scale.
  onPress?: () => void;
}) {
  const radius = size / 2;
  const initial = name?.trim()?.[0]?.toUpperCase() ?? '?';

  const face = (
    <>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: radius },
          ringColor ? { borderWidth: ringWidth, borderColor: ringColor } : null,
        ]}
      >
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <>
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="av" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={COLORS.primary} />
                  <Stop offset="1" stopColor={COLORS.secondary} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#av)" />
            </Svg>
            <Text style={[styles.initial, { fontSize: size * 0.42 }]}>
              {initial}
            </Text>
          </>
        )}
      </View>
      {online && (
        <View
          style={[
            styles.onlineDot,
            { width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14 },
          ]}
        />
      )}
      {verified && !online && (
        <View style={styles.verifiedWrap}>
          <VerifiedBadge size={Math.max(14, size * 0.36)} />
        </View>
      )}
    </>
  );

  const box = { width: size, height: size };

  if (!onPress) return <View style={box}>{face}</View>;

  return (
    <PressableScale
      style={box}
      scaleTo={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name ? `Open ${name}'s profile` : 'Open profile'}
    >
      {face}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  circle: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryTint,
  },
  initial: { fontFamily: FONTS.bold, color: '#fff' },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.success,
    borderWidth: 2.5,
    borderColor: COLORS.surface,
  },
  verifiedWrap: { position: 'absolute', right: -2, bottom: -2 },
});
