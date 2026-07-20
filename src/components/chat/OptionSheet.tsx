import { View, Text, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon, IconName, PressableScale, Sheet } from '@/components/ui';

// A bottom action sheet in the Mello style: dim backdrop, rounded card,
// icon + label rows. Used for chat-row and message long-press menus.

export interface SheetOption {
  icon: IconName;
  label: string;
  sub?: string;
  danger?: boolean;
  onPress: () => void;
}

interface OptionSheetProps {
  visible: boolean;
  title?: string;
  options: SheetOption[];
  onClose: () => void;
}

export default function OptionSheet({
  visible,
  title,
  options,
  onClose,
}: OptionSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} style={styles.card}>
      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      {options.map((opt) => (
        <PressableScale
          key={opt.label}
          scaleTo={0.98}
          style={styles.row}
          onPress={() => {
            onClose();
            // Let the sheet dismiss before the action (some actions open
            // Alerts, which fight with a closing Modal on iOS).
            setTimeout(opt.onPress, 120);
          }}
        >
          <View
            style={[styles.rowIcon, opt.danger && styles.rowIconDanger]}
          >
            <Icon
              name={opt.icon}
              size={18}
              color={opt.danger ? '#E5484D' : COLORS.textPrimary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.rowLabel, opt.danger && styles.rowLabelDanger]}
            >
              {opt.label}
            </Text>
            {opt.sub ? <Text style={styles.rowSub}>{opt.sub}</Text> : null}
          </View>
        </PressableScale>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: SPACING[4], paddingTop: SPACING[3.5], gap: SPACING[0.5] },
  title: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
    paddingHorizontal: SPACING[2],
    paddingBottom: SPACING[2.5],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingHorizontal: SPACING[2],
    paddingVertical: SPACING[2.5],
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: { backgroundColor: '#FFF0EF' },
  rowLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  rowLabelDanger: { color: '#E5484D' },
  rowSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
});
