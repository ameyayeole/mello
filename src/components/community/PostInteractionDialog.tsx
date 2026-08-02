import { View, Text, StyleSheet } from 'react-native';
import { Dialog, PressableScale } from '@/components/ui';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING, RADIUS } from '@/constants/spacing';

export function PostInteractionDialog({
  visible,
  title,
  body,
  actionLabel,
  onConfirm,
  onClose,
  isLoading = false,
}: {
  visible: boolean;
  title: string;
  body: string;
  actionLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  isLoading?: boolean;
}) {
  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.buttonRow}>
        <PressableScale
          scaleTo={0.96}
          style={[styles.btn, styles.cancelBtn]}
          onPress={onClose}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelLabel}>Cancel</Text>
        </PressableScale>
        <PressableScale
          scaleTo={0.96}
          style={[styles.btn, styles.actionBtn]}
          onPress={onConfirm}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </PressableScale>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[2],
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING[2],
    alignSelf: 'stretch',
    marginTop: SPACING[4],
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: { backgroundColor: COLORS.inkSubtle },
  cancelLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  actionBtn: { backgroundColor: COLORS.error },
  actionLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.white,
  },
});
