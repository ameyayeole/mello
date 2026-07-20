import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Button, Icon, IconName, Sheet } from '@/components/ui';

// Safety bottom sheet, matching the "Mello Screens" design gallery: left-aligned,
// 46px tinted icon tile, 19px title, bullet tips with an accent dot, coral
// primary button and a quiet text secondary. Body copy can be a paragraph
// (string) or bullet tips (string[]).

export interface SafetyPopupProps {
  visible: boolean;
  icon?: IconName;
  // Icon + bullet-dot color, and the icon tile's background tint.
  accent?: string;
  tint?: string;
  title: string;
  body: string | string[];
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  // Back button / tapping the dim overlay. Defaults to onSecondary ?? onPrimary.
  onClose?: () => void;
}

export default function SafetyPopup({
  visible,
  icon = 'shield',
  accent = COLORS.primary,
  tint = COLORS.primaryTint,
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  onClose,
}: SafetyPopupProps) {
  const close = onClose ?? onSecondary ?? onPrimary;
  const bullets = Array.isArray(body) ? body : null;

  return (
    <Sheet visible={visible} onClose={close} grabber style={styles.sheet}>
      <View style={[styles.iconTile, { backgroundColor: tint }]}>
        <Icon name={icon} size={23} color={accent} strokeWidth={1.8} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {bullets ? (
        <View style={styles.bullets}>
          {bullets.map((line, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={[styles.bulletDot, { backgroundColor: accent }]} />
              <Text style={styles.bulletText}>{line}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.body}>{body}</Text>
      )}
      <Button label={primaryLabel} onPress={onPrimary} style={styles.primary} />
      {secondaryLabel && (
        <TouchableOpacity
          onPress={onSecondary ?? close}
          hitSlop={8}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryLabel}>{secondaryLabel}</Text>
        </TouchableOpacity>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[3],
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
  },
  iconTile: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.sectionLg,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: COLORS.textPrimary,
  },
  body: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: 'rgba(15,24,44,0.6)',
    marginTop: SPACING[2],
  },
  bullets: { marginTop: SPACING[0.5] },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING[2],
    marginTop: SPACING[2.5],
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: SPACING[1.5],
  },
  bulletText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 18,
    color: 'rgba(15,24,44,0.7)',
  },
  primary: { marginTop: SPACING[4] },
  secondaryBtn: {
    height: 40,
    marginTop: SPACING[1.5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: 'rgba(15,24,44,0.55)',
  },
});
