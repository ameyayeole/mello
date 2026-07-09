import { Text, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { FONTS } from '@/constants/typography';

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
    fontSize: 11.5,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: 'rgba(15,24,44,0.4)',
  },
});
