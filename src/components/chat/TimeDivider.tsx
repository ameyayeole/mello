import { Text, StyleSheet } from 'react-native';
import { SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { chatDayLabel, formatChatTime } from '@/utils/time';
import { isToday } from 'date-fns';

// The centred line above a burst of messages: "3:22 PM" today, "YESTERDAY
// 3:22 PM" before that.
//
// This is where the time went when it came out from under every bubble. One
// line per burst rather than one per message, and centred rather than tucked
// into a corner, so it reads as a marker in the conversation instead of as
// part of what someone said.

export default function TimeDivider({ date }: { date: string }) {
  const when = new Date(date);
  const label = isToday(when)
    ? formatChatTime(date)
    : `${chatDayLabel(date)} ${formatChatTime(date)}`;

  return <Text style={styles.label}>{label.toUpperCase()}</Text>;
}

const styles = StyleSheet.create({
  label: {
    alignSelf: 'center',
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.nano,
    letterSpacing: 0.4,
    color: COLORS.textMuted,
    marginTop: SPACING[4],
    marginBottom: SPACING[1.5],
  },
});
