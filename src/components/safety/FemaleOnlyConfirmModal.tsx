import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon, PressableScale } from '@/components/ui';

// Safety popup #9 — full-screen confirm before creating a female-only event.
// Purple treatment per the design gallery (matches the Music/lilac category
// accent, not the coral brand primary).

const PURPLE = '#7C5CE0';
const PURPLE_TINT = '#F0ECFC';

export default function FemaleOnlyConfirmModal({
  visible,
  onConfirm,
  onBack,
}: {
  visible: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onBack}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <Svg width={320} height={320} style={styles.glow} pointerEvents="none">
          <Defs>
            <RadialGradient id="femGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={PURPLE} stopOpacity={0.13} />
              <Stop offset="0.68" stopColor={PURPLE} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={320} height={320} fill="url(#femGlow)" />
        </Svg>

        <View style={styles.content}>
          <View style={styles.iconTile}>
            <Icon name="heart" size={27} color={PURPLE} />
          </View>
          <Text style={styles.title}>Creating a{'\n'}female-only event</Text>
          <Text style={styles.subtitle}>
            Only women will be able to see and join this event.
          </Text>
          <View style={styles.noteCard}>
            <View style={{ marginTop: SPACING[0.5] }}>
              <Icon name="shield" size={19} color={PURPLE} />
            </View>
            <Text style={styles.noteText}>
              Please keep it a safe, welcoming space. Anyone who makes
              attendees uncomfortable can be removed and reported.
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <PressableScale
            style={styles.confirmBtn}
            onPress={onConfirm}
            accessibilityRole="button"
            accessibilityLabel="Confirm female-only"
          >
            <Text style={styles.confirmLabel}>Confirm female-only</Text>
          </PressableScale>
          <TouchableOpacity onPress={onBack} hitSlop={8} style={styles.backBtn}>
            <Text style={styles.backLabel}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  glow: { position: 'absolute', top: -70, alignSelf: 'center' },
  content: { flex: 1, paddingHorizontal: SPACING[6], paddingTop: 88 },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: PURPLE_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.titleLg,
    lineHeight: 29,
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    marginTop: SPACING[4],
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: 'rgba(15,24,44,0.6)',
    marginTop: SPACING[3],
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING[2.5],
    backgroundColor: PURPLE_TINT,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING[3.5],
    paddingHorizontal: SPACING[3.5],
    marginTop: SPACING[4],
  },
  noteText: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 17,
    color: '#4A3D80',
  },
  actions: { paddingHorizontal: SPACING[6], paddingBottom: SPACING[8] },
  confirmBtn: {
    height: 48,
    borderRadius: RADIUS.lg,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PURPLE,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  confirmLabel: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.body, color: '#fff' },
  backBtn: {
    height: 40,
    marginTop: SPACING[1],
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: 'rgba(15,24,44,0.55)',
  },
});
