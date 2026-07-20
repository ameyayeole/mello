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
import { RADIUS } from '@/constants/spacing';

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
  style,
}: BaseProps & {
  anchor: 'bottom' | 'center';
  keyboardAvoiding?: boolean;
}) {
  const card = (
    // `onPress={() => {}}` is load-bearing: without a handler the press falls
    // through to the backdrop and closes the overlay.
    <Pressable
      style={[
        anchor === 'bottom' ? styles.sheetCard : styles.dialogCard,
        style,
      ]}
      onPress={() => {}}
    >
      {children}
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // Without this the scrim stops at the status bar on Android.
      statusBarTranslucent
    >
      <Pressable
        style={[
          styles.backdrop,
          anchor === 'bottom' ? styles.alignBottom : styles.alignCenter,
        ]}
        onPress={dismissOnBackdropPress ? onClose : undefined}
      >
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
      </Pressable>
    </Modal>
  );
}

export function Sheet({
  grabber = false,
  keyboardAvoiding = false,
  children,
  ...props
}: BaseProps & { grabber?: boolean; keyboardAvoiding?: boolean }) {
  return (
    <Overlay {...props} anchor="bottom" keyboardAvoiding={keyboardAvoiding}>
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
  alignCenter: { justifyContent: 'center', paddingHorizontal: 32 },
  kav: { justifyContent: 'flex-end' },

  sheetCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 34,
  },
  dialogCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS['2xl'],
    padding: 22,
    alignItems: 'center',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(15,24,44,0.15)',
    marginTop: 8,
  },
});
