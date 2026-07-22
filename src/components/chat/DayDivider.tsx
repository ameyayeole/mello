import { Text, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { chatDayLabel } from '@/utils/time';
import { Glass } from '@/components/ui';

// "Today" / "Yesterday" / "Tuesday", centred between two days of messages.

export default function DayDivider({ date }: { date: string }) {
  return (
    <Glass tier="panel" radius={RADIUS.full} style={styles.chip}>
      <Text style={styles.label}>{chatDayLabel(date)}</Text>
    </Glass>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'center',
    paddingHorizontal: SPACING[3.5],
    paddingVertical: SPACING[1],
    marginVertical: SPACING[1],
  },
  label: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
  },
});
