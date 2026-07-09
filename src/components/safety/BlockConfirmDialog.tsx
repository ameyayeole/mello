import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Icon, PressableScale } from '@/components/ui';

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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.dialog} onPress={() => {}}>
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,24,44,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  dialog: {
    alignSelf: 'stretch',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 48,
    shadowOffset: { width: 0, height: 24 },
    elevation: 12,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(239,68,68,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 17,
    color: COLORS.textPrimary,
    marginTop: 12,
    textAlign: 'center',
  },
  body: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    lineHeight: 17,
    color: 'rgba(15,24,44,0.6)',
    textAlign: 'center',
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 9,
    alignSelf: 'stretch',
    marginTop: 18,
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: { backgroundColor: '#F0F1F3' },
  cancelLabel: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  blockBtn: { backgroundColor: COLORS.error },
  blockLabel: { fontFamily: FONTS.bold, fontSize: 14, color: '#fff' },
});
