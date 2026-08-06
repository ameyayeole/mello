import { ActivityIndicator,
  StyleProp,
  ViewStyle } from 'react-native';
import { COLORS } from '@/constants/colors';
import { SPACING } from '@/constants/spacing';
import { themedStyles } from '@/theme';

// The app's loading spinner. Every one of the twenty-two in the codebase is
// `<ActivityIndicator color={COLORS.primary} />`, and eleven of them differ
// only in how far down the screen they sit — marginTop 40, 48 or 60, picked
// per screen.
//
// `inset` collapses that to one value. Pass `inline` for a spinner sitting in a
// row of content rather than standing in for a whole screen.
//
// **The rule, now that skeletons exist:** an inline spinner reporting on an
// action in flight is a `Loader`; anything standing in for content that is
// coming is a skeleton (`ui/Skeleton` and the shapes in `components/skeletons`).
//
// This file used to say skeletons were not worth it because they "need to know
// the shape of the content they stand in for, which means one per surface, not
// one shared component". The premise was right and the conclusion was wrong: the
// shapes are shared per *family* — a person row, a chat row, a post card — not
// per screen, so six of them cover every list in the app.
//
// What is still a spinner: the seven `inline` sites (saving a profile, confirming
// a scan, sending), and the four screens whose layout a skeleton cannot predict
// — `events/edit`, `events/host`, `events/checkin`, `events/scan`.
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

const styles = themedStyles(() => ({
  // Roughly a third of the way down a bare screen — where the eye already is.
  inset: { marginTop: SPACING[12] },
}));
