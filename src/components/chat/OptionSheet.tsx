import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Icon, IconName, PressableScale } from '@/components/ui';

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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,24,44,0.45)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 34,
    gap: 2,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.textSecondary,
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 8,
    paddingVertical: 11,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: { backgroundColor: '#FFF0EF' },
  rowLabel: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: COLORS.textPrimary,
  },
  rowLabelDanger: { color: '#E5484D' },
  rowSub: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
