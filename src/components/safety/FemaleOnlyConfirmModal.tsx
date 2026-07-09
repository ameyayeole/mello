import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
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
            <View style={{ marginTop: 1 }}>
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
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 88 },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: 17,
    backgroundColor: PURPLE_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    marginTop: 18,
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: 'rgba(15,24,44,0.6)',
    marginTop: 12,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: PURPLE_TINT,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginTop: 18,
  },
  noteText: {
    flex: 1,
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: '#4A3D80',
  },
  actions: { paddingHorizontal: 24, paddingBottom: 34 },
  confirmBtn: {
    height: 48,
    borderRadius: 16,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PURPLE,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  confirmLabel: { fontFamily: FONTS.bold, fontSize: 15, color: '#fff' },
  backBtn: {
    height: 40,
    marginTop: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLabel: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: 'rgba(15,24,44,0.55)',
  },
});
