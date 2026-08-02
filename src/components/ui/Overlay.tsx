import {
  Modal,
  Pressable,
  View,
  StyleSheet,
  StyleProp,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS } from '@/constants/colors';
import { RADIUS, SPACING } from '@/constants/spacing';

// The app's two overlay shapes, over one `Modal`:
//
//   <Sheet>  slides up from the bottom edge — option lists, composers, pickers
//   <Dialog> sits centred — confirmations
//
// Sixteen screens hand-rolled this, three of the backdrops byte-identical and
// the scrim opacity drifting between 0.35, 0.45 and 0.5.
//
// The part worth centralising is the nested Pressable: the outer one dismisses
// on a backdrop tap, and the inner one exists purely to swallow taps that land
// on the card so it doesn't dismiss itself. That is easy to get subtly wrong,
// and impossible to notice when it is — the overlay just closes when it
// shouldn't.

type BaseProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  // Set false for a destructive confirm that must be dismissed by a button.
  dismissOnBackdropPress?: boolean;
  style?: StyleProp<ViewStyle>;
};

function Overlay({
  visible,
  onClose,
  children,
  dismissOnBackdropPress = true,
  anchor,
  keyboardAvoiding = false,
  // 'fade' is the default (scrim and card cross-fade together). 'slide' drives
  // the native bottom-up transition — the card travels in from the bottom edge
  // and back out on close, which a fade can't do. For sheets that are meant to
  // feel *presented* rather than to just appear.
  animation = 'fade',
  style,
}: BaseProps & {
  anchor: 'bottom' | 'center';
  keyboardAvoiding?: boolean;
  animation?: 'fade' | 'slide';
}) {
  // A plain View, deliberately. This used to be a Pressable carrying an empty
  // onPress to stop presses reaching the backdrop — which worked, but a
  // Pressable claims the touch before any nested scrollable can, so a sheet
  // containing a ScrollView (a picker wheel, a long list) could never be
  // scrolled. The backdrop is a sibling *behind* the card now, so presses on
  // the card simply never reach it and no swallowing handler is needed.
  const card = (
    <View
      style={[anchor === 'bottom' ? styles.sheetCard : styles.dialogCard, style]}
    >
      {children}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animation}
      onRequestClose={onClose}
      // Without this the scrim stops at the status bar on Android.
      statusBarTranslucent
    >
      <View
        style={[
          styles.backdrop,
          anchor === 'bottom' ? styles.alignBottom : styles.alignCenter,
        ]}
      >
        {dismissOnBackdropPress ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityLabel="Dismiss"
          />
        ) : null}
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.kav}
            pointerEvents="box-none"
          >
            {card}
          </KeyboardAvoidingView>
        ) : (
          card
        )}
      </View>
    </Modal>
  );
}

export function Sheet({
  grabber = false,
  keyboardAvoiding = false,
  animation = 'fade',
  children,
  ...props
}: BaseProps & {
  grabber?: boolean;
  keyboardAvoiding?: boolean;
  animation?: 'fade' | 'slide';
}) {
  return (
    <Overlay
      {...props}
      anchor="bottom"
      keyboardAvoiding={keyboardAvoiding}
      animation={animation}
    >
      {grabber ? <View style={styles.grabber} /> : null}
      {children}
    </Overlay>
  );
}

export function Dialog(props: BaseProps) {
  return <Overlay {...props} anchor="center" />;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: COLORS.scrim },
  alignBottom: { justifyContent: 'flex-end' },
  alignCenter: { justifyContent: 'center', paddingHorizontal: SPACING[8] },
  kav: { justifyContent: 'flex-end' },

  sheetCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: SPACING[8],
  },
  dialogCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS['2xl'],
    padding: SPACING[6],
    alignItems: 'center',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(15,24,44,0.15)',
    marginTop: SPACING[2],
  },
});
