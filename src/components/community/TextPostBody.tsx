import { Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';

export function TextPostBody({ body }: { body: string }) {
  return <Text style={styles.body}>{body}</Text>;
}

const styles = StyleSheet.create({
  body: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.body,
    lineHeight: TYPE_SIZE.body * 1.4,
    color: COLORS.textPrimary,
    marginTop: SPACING[3],
  },
});
