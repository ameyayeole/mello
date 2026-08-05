import { useCallback } from 'react';
import { router, useNavigation, type NativeStackNavigationProp } from 'expo-router';

type ConversationNavigation = NativeStackNavigationProp<Record<string, undefined>>;

/**
 * Back, for a conversation's header button: one press lands on the Inbox list.
 *
 * `popToTop`, not `pop`. `dangerouslySingular` in chats/_layout keeps this stack
 * at the list plus one thread, so for an event chat *or* a DM these are the same
 * movement — but reach a DM from inside an event chat (the profile sheet) and the
 * stack legitimately holds one of each, and a single pop would land on the thread
 * underneath rather than on the list. Popping to the top is the promise that back
 * means "out of here", not "one step back through everything I have opened".
 *
 * The guard reads this stack's own routes rather than `canGoBack()`. `canGoBack`
 * answers for the whole chain — it is true when the *tab* navigator could go back
 * even though this stack cannot — so it let `popToTop` through on a stack of one,
 * where it was declined by every navigator in turn and logged
 * `The action 'POP_TO_TOP' was not handled by any navigator`. Nothing to pop is a
 * real state (`openEventChat`/`openDmChat` in utils/chatActions are what usually
 * prevent it, by loading the list as the stack's anchor), so it gets an answer
 * rather than a dispatch that fails.
 */
export function useBackToInbox() {
  const navigation = useNavigation<ConversationNavigation>();

  return useCallback(() => {
    const state = navigation.getState();
    if (state && state.routes.length > 1) {
      navigation.popToTop();
      return;
    }
    // A thread with nothing beneath it: deep-linked in from outside the tabs, or
    // opened by something that bypassed chatActions. `replace` rather than
    // `navigate` — navigate would *push* the list on top of the thread, leaving
    // back to walk into it again, which is the bug this hook exists for.
    router.replace('/(tabs)/chats');
  }, [navigation]);
}
