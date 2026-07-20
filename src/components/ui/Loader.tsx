import { ActivityIndicator, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { COLORS } from '@/constants/colors';

// The app's loading spinner. Every one of the twenty-two in the codebase is
// `<ActivityIndicator color={COLORS.primary} />`, and eleven of them differ
// only in how far down the screen they sit — marginTop 40, 48 or 60, picked
// per screen.
//
// `inset` collapses that to one value. Pass `inline` for a spinner sitting in a
// row of content rather than standing in for a whole screen.
//
// Deliberately not a skeleton. Skeletons need to know the shape of the content
// they stand in for, which means one per surface, not one shared component.
export function Loader({
  inline = false,
  color = COLORS.primary,
  style,
}: {
  inline?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ActivityIndicator
      color={color}
      size={inline ? 'small' : 'large'}
      style={[!inline && styles.inset, style]}
    />
  );
}

const styles = StyleSheet.create({
  // Roughly a third of the way down a bare screen — where the eye already is.
  inset: { marginTop: 56 },
});
