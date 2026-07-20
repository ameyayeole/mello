import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
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
          <Button
  variant="tertiary" label="Got it" onPress={onDone} />
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
  content: { flex: 1, paddingHorizontal: SPACING[6], paddingTop: 84 },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.titleLg,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    marginTop: SPACING[4],
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: 'rgba(15,24,44,0.55)',
    marginTop: SPACING[2.5],
  },
  tips: { gap: SPACING[2.5], marginTop: SPACING[5] },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING[3],
    paddingHorizontal: SPACING[3.5],
  },
  tipIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipLabel: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textPrimary,
  },
  footnote: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 17,
    color: 'rgba(15,24,44,0.5)',
    marginTop: SPACING[4],
  },
  actions: { paddingHorizontal: SPACING[6], paddingBottom: SPACING[8] },
  secondaryBtn: {
    height: 40,
    marginTop: SPACING[1],
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: 'rgba(15,24,44,0.55)',
  },
});
