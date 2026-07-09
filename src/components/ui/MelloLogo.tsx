import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, RadialGradient, Rect } from 'react-native-svg';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';

const PIN_PATH =
  'M31.6966 301.576C13.024 272.602 2.16588 238.779 0.291773 203.75C-1.58233 168.721 5.59861 133.815 21.0612 102.79C36.5237 71.7649 59.6819 45.7976 88.0413 27.6847C116.401 9.57192 148.887 0 182 0C215.113 0 247.599 9.57192 275.959 27.6847C304.318 45.7976 327.476 71.7649 342.939 102.79C358.401 133.815 365.582 168.721 363.708 203.75C363.224 212.807 362.138 221.784 360.473 230.617H106.848C103.781 260.951 128.831 311.327 182.511 309.702C225.455 308.402 245.393 275.215 249.994 258.784H353.026C347.854 273.84 340.909 288.223 332.303 301.576L211.14 499.288C183.022 539.913 161.039 510.121 152.859 499.288L31.6966 301.576ZM258.174 187.283H106.848C105.315 160.922 117.891 108.09 180.466 107.657C243.041 107.224 258.344 160.561 258.174 187.283Z';

// Brand pin mark. Gradient is reserved for the logo pin only (design rule).
export function MelloPin({ height = 44 }: { height?: number }) {
  const width = (height * 364) / 520;
  return (
    <Svg width={width} height={height} viewBox="0 0 364 520" fill="none">
      <Defs>
        <LinearGradient id="melloPin" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={COLORS.primary} />
          <Stop offset="1" stopColor={COLORS.secondary} />
        </LinearGradient>
      </Defs>
      <Path d={PIN_PATH} fill="url(#melloPin)" fillRule="evenodd" clipRule="evenodd" />
    </Svg>
  );
}

// Wordmark lockup: pin + lowercase "mello".
export function MelloWordmark({ size = 44 }: { size?: number }) {
  return (
    <View style={styles.row}>
      <MelloPin height={size * 0.92} />
      <Text style={[styles.word, { fontSize: size }]}>mello</Text>
    </View>
  );
}

// Soft coral radial glow used behind hero content on auth screens.
export function CoralGlow({ size = 300, style }: { size?: number; style?: object }) {
  return (
    <Svg width={size} height={size} style={style} pointerEvents="none">
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={COLORS.primary} stopOpacity={0.16} />
          <Stop offset="0.68" stopColor={COLORS.primary} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={size} height={size} fill="url(#glow)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  word: {
    fontFamily: FONTS.heavy,
    color: COLORS.accent,
    letterSpacing: -1.5,
  },
});
