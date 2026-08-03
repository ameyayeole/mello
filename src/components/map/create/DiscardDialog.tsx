import { StyleSheet, Text, View } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Dialog, PressableScale } from '@/components/ui';
import { TAP_SCALE } from './motion';

// Leaving keeps the draft, so the question is no longer "lose this work?" but
// "which did you mean?" — the destructive option has to be the explicit one.
//
// Kept out of ui/ rather than promoted: one caller, and its two-button row is
// its own shape rather than the Dialog's.
export function DiscardDialog({
  visible,
  onClose,
  onKeep,
  onDiscard,
}: {
  visible: boolean;
  onClose: () => void;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <Dialog visible={visible} onClose={onClose}>
      <Text style={styles.discardTitle}>Leave this event?</Text>
      <Text style={styles.discardBody}>
        We&apos;ll keep your draft so you can pick it up later.
      </Text>
      <View style={styles.discardRow}>
        <PressableScale
          scaleTo={TAP_SCALE}
          style={[styles.discardBtn, styles.discardKeep]}
          onPress={onKeep}
          accessibilityRole="button"
          accessibilityLabel="Save for later"
        >
          <Text style={styles.discardKeepLabel}>Save for later</Text>
        </PressableScale>
        <PressableScale
          scaleTo={TAP_SCALE}
          style={[styles.discardBtn, styles.discardGo]}
          onPress={onDiscard}
          accessibilityRole="button"
          accessibilityLabel="Discard draft"
        >
          <Text style={styles.discardGoLabel}>Discard</Text>
        </PressableScale>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  // Same shape and tokens as the community delete confirm, so the two
  // destructive prompts in the app read identically.
  discardTitle: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  discardBody: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[2],
  },
  discardRow: {
    flexDirection: 'row',
    gap: SPACING[2],
    alignSelf: 'stretch',
    marginTop: SPACING[4],
  },
  discardBtn: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardKeep: { backgroundColor: COLORS.inkSubtle },
  discardKeepLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  discardGo: { backgroundColor: COLORS.error },
  discardGoLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.white,
  },
});
