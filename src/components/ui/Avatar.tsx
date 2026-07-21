import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { VerifiedBadge } from './Icon';

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
}) {
  const radius = size / 2;
  const initial = name?.trim()?.[0]?.toUpperCase() ?? '?';

  return (
    <View style={{ width: size, height: size }}>
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
    </View>
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
