import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, CoralGlow, Icon, IconName, MelloPin } from '@/components/ui';

// Safety popup #1 ("Welcome to a safer Mello") — full-screen interstitial per
// the design gallery: pin logo, coral glow, three tinted tip cards, coral CTA.

const TIPS: { icon: IconName; label: string }[] = [
  { icon: 'location', label: 'Meet in public places' },
  { icon: 'chat', label: 'Tell a friend your plan' },
  { icon: 'heart', label: 'Trust your gut' },
];

export default function WelcomeSafetyModal({
  visible,
  onDone,
  onSafetyCentre,
}: {
  visible: boolean;
  onDone: () => void;
  onSafetyCentre: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onDone}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <CoralGlow size={320} style={styles.glow} />
        <View style={styles.content}>
          <MelloPin height={49} />
          <Text style={styles.title}>You're about to{'\n'}meet your city</Text>
          <Text style={styles.subtitle}>
            Mello is for meeting real people in real life. A few quick safety
            basics:
          </Text>
          <View style={styles.tips}>
            {TIPS.map((tip) => (
              <View key={tip.label} style={styles.tipCard}>
                <View style={styles.tipIcon}>
                  <Icon name={tip.icon} size={19} color={COLORS.primary} />
                </View>
                <Text style={styles.tipLabel}>{tip.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.footnote}>
            You can block or report anyone, anytime.
          </Text>
        </View>
        <View style={styles.actions}>
          <Button label="Got it" onPress={onDone} />
          <TouchableOpacity onPress={onSafetyCentre} hitSlop={8} style={styles.secondaryBtn}>
            <Text style={styles.secondaryLabel}>Read the Safety Centre</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  glow: {
    position: 'absolute',
    top: -70,
    alignSelf: 'center',
  },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 84 },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    marginTop: 18,
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: 'rgba(15,24,44,0.55)',
    marginTop: 10,
  },
  tips: { gap: 11, marginTop: 20 },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.background,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  tipIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    color: COLORS.textPrimary,
  },
  footnote: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    lineHeight: 17,
    color: 'rgba(15,24,44,0.5)',
    marginTop: 16,
  },
  actions: { paddingHorizontal: 24, paddingBottom: 34 },
  secondaryBtn: {
    height: 40,
    marginTop: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: 'rgba(15,24,44,0.55)',
  },
});
