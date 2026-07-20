import { Text, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { COLORS } from '@/constants/colors';

// Uppercase overline section label.
export function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.micro,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
  },
});
