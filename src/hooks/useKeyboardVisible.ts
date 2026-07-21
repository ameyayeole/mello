import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Whether the software keyboard is on screen.
 *
 * Used by the chat composers to decide whether they still owe the home
 * indicator a bottom inset. With the keyboard up, `KeyboardAvoidingView` has
 * already lifted the composer clear of the bottom of the screen, so adding the
 * inset on top of that opens a gap between the composer and the keyboard.
 *
 * iOS fires `keyboardWillShow` ahead of the animation, which keeps the inset
 * from collapsing a frame late; Android only has the `did` events.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
