import {
  StyleSheet,
  StyleProp,
  ViewStyle,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '@/constants/colors';

// Standard screen shell: safe area + status bar style + optional keyboard
// avoidance, so screens stop each re-deriving all three.
//
// Uses SafeAreaView from react-native-safe-area-context, NOT the one exported
// by react-native core. The core component is iOS-only — on Android it renders
// as a plain View, which is why screens using it have content sitting under the
// Android status bar.
//
// `edges` defaults to top only. Bottom insets are deliberately opt-in: screens
// inside the tab navigator already get bottom padding from the tab bar, and
// insetting again double-pads them.
export function Screen({
  children,
  edges = ['top'],
  modal = false,
  statusBar = 'dark',
  keyboardAvoiding = false,
  background = COLORS.background,
  style,
}: {
  children: React.ReactNode;
  edges?: readonly Edge[];
  // Set on routes declared with `presentation: 'modal'`. See below — this is
  // not cosmetic, without it the header is padded twice on iOS.
  modal?: boolean;
  // Colour of the status bar *content*. Use 'light' on dark headers.
  statusBar?: 'light' | 'dark';
  keyboardAvoiding?: boolean;
  background?: string;
  style?: StyleProp<ViewStyle>;
}) {
  // A modal card on iOS is already presented below the notch, but
  // safe-area-context reports the *window* insets regardless of presentation —
  // so applying the top edge there adds the full status-bar height a second
  // time. Android modals cover the status bar like any other screen, so the
  // inset is still needed there.
  const resolvedEdges =
    modal && Platform.OS === 'ios' ? edges.filter((e) => e !== 'top') : edges;

  const body = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {children}
    </KeyboardAvoidingView>
  ) : (
    children
  );

  return (
    <SafeAreaView
      edges={resolvedEdges}
      style={[styles.fill, { backgroundColor: background }, style]}
    >
      <StatusBar style={statusBar} />
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
