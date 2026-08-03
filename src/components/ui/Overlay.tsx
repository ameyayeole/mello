import { useCallback, useEffect, useState } from 'react';
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
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  SlideInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
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
  grabber = false,
  style,
}: BaseProps & {
  anchor: 'bottom' | 'center';
  keyboardAvoiding?: boolean;
  animation?: 'fade' | 'slide';
  grabber?: boolean;
}) {
  // A plain View, deliberately. This used to be a Pressable carrying an empty
  // onPress to stop presses reaching the backdrop — which worked, but a
  // Pressable claims the touch before any nested scrollable can, so a sheet
  // containing a ScrollView (a picker wheel, a long list) could never be
  // scrolled. The backdrop is a sibling *behind* the card now, so presses on
  // the card simply never reach it and no swallowing handler is needed.

  // `slide` is driven here rather than by the Modal. Modal's own slide animates
  // the whole tree — scrim included — so the dim travelled up from the bottom
  // edge with the card and read as a black panel rising rather than as the page
  // dimming. Splitting them lets the scrim fade in place while only the card
  // moves, which is what a presented sheet is supposed to look like.
  const sliding = animation === 'slide';

  // Drag-to-dismiss. A grabber is a promise that the sheet can be pulled down;
  // without this it was decoration and the sheet ignored the gesture entirely.
  //
  // The gesture lives on the grabber strip rather than on the whole card on
  // purpose. These sheets hold pickers, and a pan over the card would have to
  // arbitrate with the wheel's own scroll on every touch — the usual source of
  // a sheet that sometimes scrolls and sometimes drags. A dedicated handle has
  // no such ambiguity.
  const dragY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onChange((e) => {
      // Downward only; pulling up should not lift the sheet off its edge.
      dragY.value = Math.max(0, dragY.value + e.changeY);
    })
    .onEnd((e) => {
      const far = dragY.value > DISMISS_PX;
      const fast = e.velocityY > DISMISS_VELOCITY;
      if (far || fast) {
        // Tell the parent straight away and let the effect above drive the
        // travel, so a dragged dismiss and a tapped one end identically.
        runOnJS(onClose)();
      } else {
        dragY.value = withSpring(0, { stiffness: 220, damping: 26, mass: 0.8 });
      }
    });

  // The Modal outlives `visible` by the length of one exit animation.
  //
  // A Modal unmounts its children the instant `visible` goes false, so a
  // Reanimated `exiting` on the card never got a frame to run — dismissing by
  // backdrop tap or by a button made the sheet vanish while only the scrim
  // faded. Holding it mounted lets the card slide out under its own power, and
  // every dismiss path (tap, button, hardware back, drag) now leaves the same
  // way.
  // Open needs no state at all — `visible` already says so. Only the closing
  // half has to be remembered, for exactly as long as the card takes to leave.
  const [exiting, setExiting] = useState(false);
  const mounted = visible || exiting;

  const done = useCallback(() => setExiting(false), []);

  useEffect(() => {
    if (visible) {
      // Also resets the offset a drag-dismiss parked at its thrown-out value —
      // without which the next open renders the card off the bottom of the
      // screen and the sheet appears not to open at all.
      dragY.value = 0;
      return;
    }
    if (!sliding) return;
    // Deliberate: this is the bridge between a prop flipping and an animation
    // that has to finish before the Modal may unmount. There is no render-phase
    // way to express "stay mounted a moment longer".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExiting(true);
    dragY.value = withTiming(EXIT_PX, EXIT_TIMING, (finished) => {
      if (finished) runOnJS(done)();
    });
  }, [visible, sliding, dragY, done]);

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));
  // The scrim lightens as the sheet is pulled away, so the page underneath comes
  // back with the gesture rather than only at the end of it.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(dragY.value, [0, 260], [1, 0], 'clamp'),
  }));

  // Nothing below this line is built while the overlay is shut.
  //
  // `Modal` does *not* spare its children when `visible` is false — it
  // reconciles them anyway — so every Sheet in the app was mounting its full
  // contents as soon as its parent rendered, whether or not it was ever opened.
  // The create flow made the cost visible: pressing Create mounted the date,
  // time and duration wheels — 90 + 48 + 24 rows, each carrying its own
  // animated-style worklet — before the user had touched a picker.
  //
  // `mounted`, not `visible`, so a closing sheet keeps its content through the
  // exit animation. Reopening remounts, which is the correct behaviour rather
  // than merely an acceptable one: `Wheel` seeds its scroll offset from `value`
  // at mount, so it now opens centred on the current selection every time.
  // Callers hold their draft state outside their `<Sheet>`, so there is nothing
  // to lose on the way down.
  if (!mounted) return null;

  const card = (
    <View
      style={[anchor === 'bottom' ? styles.sheetCard : styles.dialogCard, style]}
    >
      {sliding && grabber ? (
        <GestureDetector gesture={pan}>
          {/* The strip, not just the pill — 5pt is not a target. */}
          <View style={styles.grabberHit}>
            <View style={styles.grabber} />
          </View>
        </GestureDetector>
      ) : grabber ? (
        <View style={styles.grabberHit}>
          <View style={styles.grabber} />
        </View>
      ) : null}
      {children}
    </View>
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType={sliding ? 'none' : animation}
      onRequestClose={onClose}
      // Without this the scrim stops at the status bar on Android.
      statusBarTranslucent
    >
      {/* A Modal renders into its own native hierarchy, which the app-root
          GestureHandlerRootView does not reach into — without one here the pan
          below is registered and then never fires. It costs nothing when there
          is no gesture inside. */}
      <GestureHandlerRootView
        style={[
          styles.backdropRoot,
          anchor === 'bottom' ? styles.alignBottom : styles.alignCenter,
        ]}
      >
        {/* Two views, not one. A layout animation and an animated style cannot
            share a property: `entering` drives opacity, `scrimStyle` drives
            opacity, and Reanimated warned on every open that one would
            overwrite the other — which is the drag-to-lighten scrim losing to
            the fade-in. The wrapper owns the entrance, the inner view owns the
            drag response, and neither touches the other's property. */}
        <Animated.View
          style={StyleSheet.absoluteFill}
          entering={sliding ? FadeIn.duration(220) : undefined}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.backdrop, sliding && scrimStyle]}>
            {dismissOnBackdropPress ? (
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={onClose}
                accessibilityLabel="Dismiss"
              />
            ) : null}
          </Animated.View>
        </Animated.View>
        {sliding ? (
          <Animated.View
            style={dragStyle}
            entering={SlideInDown.duration(300).easing(Easing.out(Easing.cubic))}
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
          </Animated.View>
        ) : keyboardAvoiding ? (
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
      </GestureHandlerRootView>
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
    // The grabber is Overlay's to render now, not a child passed in: it is the
    // drag handle, so it has to sit inside the gesture the card owns.
    <Overlay
      {...props}
      anchor="bottom"
      keyboardAvoiding={keyboardAvoiding}
      animation={animation}
      grabber={grabber}
    >
      {children}
    </Overlay>
  );
}

export function Dialog(props: BaseProps) {
  return <Overlay {...props} anchor="center" />;
}

// How far the card travels on its way out, and how long it takes. Far enough to
// clear any sheet this holds — it is a translate, so it costs no layout.
const EXIT_PX = 700;
const EXIT_TIMING = { duration: 260, easing: Easing.in(Easing.cubic) } as const;
const DISMISS_PX = 90;
const DISMISS_VELOCITY = 900;

const styles = StyleSheet.create({
  // Root holds the layout; the scrim is a layer inside it, so the dim can fade
  // on its own while the card slides.
  backdropRoot: { flex: 1 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.scrim,
  },
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
  // The draggable strip. The pill itself is 5pt tall — far under a usable
  // target — so the gesture lives on a padded row around it.
  grabberHit: { paddingTop: SPACING[2], paddingBottom: SPACING[2] },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.chipGrab,
  },
});
