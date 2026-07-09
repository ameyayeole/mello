import { View, Text, StyleSheet, Modal, Linking, ScrollView } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { sharePlan } from '@/utils/sharePlan';
import { Icon, IconName, PressableScale } from '@/components/ui';

// Popup #14: the in-app SOS screen, per the design gallery — a dominant red
// "Call 112" button, secondary helplines, then Share-my-plan and Report cards.
// Never gated: shown every time the SOS button is tapped.

interface SosModalProps {
  visible: boolean;
  onClose: () => void;
  // When opened from an event context, enables "Share my plan".
  event?: { title: string; location_name?: string | null; starts_at: string } | null;
  // Navigate to a report entry point (e.g. the host's profile). Optional.
  onReport?: () => void;
}

function ActionCard({
  background,
  icon,
  iconColor,
  label,
  sub,
  onPress,
}: {
  background: string;
  icon: IconName;
  iconColor: string;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      scaleTo={0.97}
      style={[styles.card, { backgroundColor: background }]}
      onPress={onPress}
    >
      <View style={styles.cardIcon}>
        <Icon name={icon} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardLabel}>{label}</Text>
        <Text style={styles.cardSub}>{sub}</Text>
      </View>
      <Icon name="chevronRight" size={18} color="rgba(15,24,44,0.35)" />
    </PressableScale>
  );
}

export default function SosModal({ visible, onClose, event, onReport }: SosModalProps) {
  const call = (number: string) => Linking.openURL(`tel:${number}`);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <View style={styles.closeRow}>
          <PressableScale
            scaleTo={0.9}
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <Icon name="close" size={16} color={COLORS.textPrimary} strokeWidth={2} />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.heroIcon}>
            <Icon name="phone" size={28} color={COLORS.error} />
          </View>
          <Text style={styles.title}>Need help right now?</Text>
          <Text style={styles.subtitle}>
            If you're in danger, contact the authorities first. These are free,
            24/7.
          </Text>

          <PressableScale
            style={styles.emergencyBtn}
            onPress={() => call('112')}
            accessibilityRole="button"
            accessibilityLabel="Call 112, national emergency"
          >
            <Icon name="phone" size={18} color="#fff" strokeWidth={2} />
            <Text style={styles.emergencyLabel}>Call 112 · Emergency</Text>
          </PressableScale>

          <View style={styles.helplineRow}>
            <PressableScale
              scaleTo={0.96}
              style={styles.helplineBtn}
              onPress={() => call('181')}
              accessibilityRole="button"
              accessibilityLabel="Call women's helpline 181"
            >
              <Text style={styles.helplineLabel}>Women's helpline</Text>
              <Text style={styles.helplineNumber}>181 · 1091</Text>
            </PressableScale>
            <PressableScale
              scaleTo={0.96}
              style={styles.helplineBtn}
              onPress={() => call('108')}
              accessibilityRole="button"
              accessibilityLabel="Call ambulance 108"
            >
              <Text style={styles.helplineLabel}>Ambulance</Text>
              <Text style={styles.helplineNumber}>108</Text>
            </PressableScale>
          </View>

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.orLine} />
          </View>

          {event && (
            <ActionCard
              background="#E9F0FC"
              icon="send"
              iconColor={COLORS.verified}
              label="Share my plan"
              sub="With a trusted contact"
              onPress={() => sharePlan(event)}
            />
          )}
          {onReport && (
            <ActionCard
              background={COLORS.primaryTint}
              icon="flag"
              iconColor={COLORS.primary}
              label="Report a Mello user"
              sub="Confidential · reviewed fast"
              onPress={() => {
                onClose();
                onReport();
              }}
            />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface, paddingTop: 54 },
  closeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 40 },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(239,68,68,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 24,
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    marginTop: 14,
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(15,24,44,0.55)',
    marginTop: 6,
  },
  emergencyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.error,
    marginTop: 16,
    shadowColor: COLORS.error,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  emergencyLabel: { fontFamily: FONTS.heavy, fontSize: 15, color: '#fff' },
  helplineRow: { flexDirection: 'row', gap: 9, marginTop: 9 },
  helplineBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helplineLabel: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.textPrimary,
  },
  helplineNumber: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.error,
    marginTop: 1,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
  },
  orLine: { flex: 1, height: 1, backgroundColor: 'rgba(15,24,44,0.1)' },
  orText: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: 'rgba(15,24,44,0.4)',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginTop: 14,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: COLORS.textPrimary,
  },
  cardSub: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: 'rgba(15,24,44,0.5)',
    marginTop: 1,
  },
});
