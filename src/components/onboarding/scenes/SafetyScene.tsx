import { View, Text, StyleSheet } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import Animated, { ZoomIn, Easing } from 'react-native-reanimated';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
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
    paddingVertical: SPACING[5],
    paddingHorizontal: SPACING[4],
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
    fontSize: TYPE_SIZE.titleLg,
    color: '#D6478E',
    letterSpacing: 0.5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    marginTop: SPACING[3],
  },
  name: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.section,
    letterSpacing: -0.34,
    color: COLORS.textPrimary,
  },
  handle: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  divider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING[3],
  },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1.5] },
  trustText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
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
    borderRadius: RADIUS['3xl'],
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
    gap: SPACING[1.5],
    paddingHorizontal: SPACING[3],
    height: 36,
    borderRadius: RADIUS.full,
  },
  chipLeft: { left: '7%', bottom: '24%' },
  chipRight: { right: '8%', bottom: '15%' },
  chipGlyph: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.body,
    color: '#D6478E',
  },
  chipText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textPrimary,
  },
});
