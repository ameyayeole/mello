import { useState } from 'react';
import { StyleSheet, Text, StyleProp, ViewStyle } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Icon, PressableScale } from '@/components/ui';
import SosModal from './SosModal';

// The persistent safety entry point (spec #14): a small shield pill that opens
// the SOS screen. Drop it on event screens and chat headers.

interface SosButtonProps {
  event?: { title: string; location_name?: string | null; starts_at: string } | null;
  onReport?: () => void;
  // 'pill' shows a labelled pill; 'icon' is a compact header button.
  variant?: 'pill' | 'icon';
  style?: StyleProp<ViewStyle>;
}

export default function SosButton({
  event,
  onReport,
  variant = 'icon',
  style,
}: SosButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <PressableScale
        scaleTo={0.9}
        style={[variant === 'pill' ? styles.pill : styles.iconBtn, style]}
        onPress={() => setOpen(true)}
        accessibilityLabel="Safety and emergency help"
        accessibilityRole="button"
      >
        <Icon name="shield" size={variant === 'pill' ? 15 : 19} color={COLORS.error} strokeWidth={2} />
        {variant === 'pill' && <Text style={styles.pillText}>Safety</Text>}
      </PressableScale>
      <SosModal
        visible={open}
        onClose={() => setOpen(false)}
        event={event}
        onReport={onReport}
      />
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 100,
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  pillText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.error,
  },
});
