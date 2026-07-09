import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, Icon, IconName } from '@/components/ui';

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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,24,44,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 30,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(15,24,44,0.15)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  iconTile: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: COLORS.textPrimary,
  },
  body: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: 'rgba(15,24,44,0.6)',
    marginTop: 9,
  },
  bullets: { marginTop: 2 },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  bulletText: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(15,24,44,0.7)',
  },
  primary: { marginTop: 18 },
  secondaryBtn: {
    height: 40,
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: 'rgba(15,24,44,0.55)',
  },
});
