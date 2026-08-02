import { Switch } from 'react-native';
import { COLORS } from '@/constants/colors';

// The app's on/off switch. A thin wrapper over the platform Switch, which is
// the right control here — it owns the gesture, the platform's own animation
// and the accessibility semantics, and nothing about the design asks for a
// bespoke one. What it does not own is the colours, and every caller was
// respecifying those by hand.
//
// Four screens had done that independently and one had already drifted: the map
// filters set only the "on" track, leaving the off state and the thumb to the
// platform default, so the same control looked different there than in
// settings, event edit and event create. That is the failure mode AGENTS.md
// describes — cheaper to restate than to centralise, until the states disagree.
//
// `ios_backgroundColor` matters: without it iOS paints its own grey behind the
// track during the flick, so the off state flashes the wrong colour on the way
// across even when `trackColor.false` is set.
export function Toggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ true: COLORS.primary, false: COLORS.disabled }}
      thumbColor={COLORS.surface}
      ios_backgroundColor={COLORS.disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
    />
  );
}
