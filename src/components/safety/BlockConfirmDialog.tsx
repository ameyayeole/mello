import { View, Text, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Dialog, Icon, PressableScale } from '@/components/ui';

// Safety popup #13: block confirmation, per the design gallery — a centered
// alert card with a red block glyph and Cancel / Block buttons. Every time.

export default function BlockConfirmDialog({
  visible,
  name,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  name?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog visible={visible} onClose={onCancel} style={styles.dialog}>
      <View style={styles.iconBubble}>
        <Icon name="block" size={22} color={COLORS.error} />
      </View>
      <Text style={styles.title}>Block {name ?? 'this user'}?</Text>
      <Text style={styles.body}>
        You'll both disappear from each other across Mello — profiles,
        events, chats and messages. They won't be told. You can unblock
        later in Settings.
      </Text>
      <View style={styles.buttonRow}>
        <PressableScale
          scaleTo={0.96}
          style={[styles.btn, styles.cancelBtn]}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelLabel}>Cancel</Text>
        </PressableScale>
        <PressableScale
          scaleTo={0.96}
          style={[styles.btn, styles.blockBtn]}
          onPress={onConfirm}
          accessibilityRole="button"
          accessibilityLabel="Block"
        >
          <Text style={styles.blockLabel}>Block</Text>
        </PressableScale>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  dialog: {
    alignSelf: 'stretch',
    paddingTop: SPACING[5],
    paddingHorizontal: SPACING[5],
    paddingBottom: SPACING[4],
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 48,
    shadowOffset: { width: 0, height: 24 },
    elevation: 12,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: RADIUS['3xl'],
    backgroundColor: 'rgba(239,68,68,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
    marginTop: SPACING[3],
    textAlign: 'center',
  },
  body: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 17,
    color: 'rgba(15,24,44,0.6)',
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
  cancelBtn: { backgroundColor: '#F0F1F3' },
  cancelLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  blockBtn: { backgroundColor: COLORS.error },
  blockLabel: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.bodyMd, color: '#fff' },
});
