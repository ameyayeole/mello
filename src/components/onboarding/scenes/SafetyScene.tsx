import { View, Text, StyleSheet } from 'react-native';
import Animated, { ZoomIn, Easing } from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Icon, VerifiedBadge } from '@/components/ui';
import { Stage, FloatingCard, PulseRing } from '../Stage';

// Slide 4: a verified profile card with trust chips orbiting it.
export function SafetyScene() {
  return (
    <Stage>
      <View style={styles.center}>
        <FloatingCard delay={150} float={4} style={styles.profileCard}>
          <View style={styles.avatarBig}>
            <Text style={styles.avatarInitials}>AS</Text>
          </View>
          <View style={styles.nameRow}>
            <Text style={styles.name}>Asha, 24</Text>
            <VerifiedBadge size={17} />
          </View>
          <Text style={styles.handle}>@asha.k</Text>
          <View style={styles.divider} />
          <View style={styles.trustRow}>
            <Icon name="shield" size={15} color={COLORS.success} strokeWidth={2} />
            <Text style={styles.trustText}>ID verified host</Text>
          </View>
        </FloatingCard>

        {/* shield badge pinned to the card's corner */}
        <Animated.View
          entering={ZoomIn.delay(700).duration(300).easing(Easing.out(Easing.cubic))}
          style={styles.shieldBadge}
        >
          <View style={styles.shieldRing}>
            <PulseRing size={54} color={COLORS.primary} delay={1100} />
          </View>
          <View style={styles.shieldCircle}>
            <Icon name="shield" size={24} color="#fff" strokeWidth={2.2} />
          </View>
        </Animated.View>

        <FloatingCard delay={950} float={6} style={[styles.chip, styles.chipLeft]}>
          <Text style={styles.chipGlyph}>♀</Text>
          <Text style={styles.chipText}>Women-only events</Text>
        </FloatingCard>
        <FloatingCard delay={1150} float={7} style={[styles.chip, styles.chipRight]}>
          <Icon name="user" size={14} color={COLORS.verified} strokeWidth={2.2} />
          <Text style={styles.chipText}>18+ community</Text>
        </FloatingCard>
      </View>
    </Stage>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  profileCard: {
    width: 216,
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderRadius: 26,
  },
  avatarBig: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FBE7F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: FONTS.heavy,
    fontSize: 24,
    color: '#D6478E',
    letterSpacing: 0.5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  name: {
    fontFamily: FONTS.heavy,
    fontSize: 17,
    letterSpacing: -0.34,
    color: COLORS.textPrimary,
  },
  handle: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  divider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 13,
  },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trustText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.textPrimary,
  },
  shieldBadge: {
    position: 'absolute',
    top: '26%',
    right: '21%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: COLORS.primary,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  chip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    height: 36,
    borderRadius: 100,
  },
  chipLeft: { left: '7%', bottom: '24%' },
  chipRight: { right: '8%', bottom: '15%' },
  chipGlyph: {
    fontFamily: FONTS.heavy,
    fontSize: 15,
    color: '#D6478E',
  },
  chipText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.textPrimary,
  },
});
