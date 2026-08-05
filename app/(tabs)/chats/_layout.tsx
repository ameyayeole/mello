import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';

// Anchor the chats list as the stack's initial route. Without this, deep-pushing
// into `chats/[eventId]` from outside the tabs (e.g. the event host screen) mounts
// the chat with no `index` beneath it — so back falls through to the Home tab and
// the Inbox tab gets stuck on that chat with no way back to the list.
export const unstable_settings = {
  initialRouteName: 'index',
};

// This tab is the only one whose routes sit under a *nested* stack, and that is
// what made it the one flat grey tab in an app that otherwise floats on the
// drifting field from DESIGN.md §2.
//
// A native stack hands react-native-screens a container colour taken straight
// off the navigation theme:
//
//   <ScreenStack nativeContainerStyle={{ backgroundColor: colors.background }}>
//                       — expo-router/…/native-stack/views/NativeStackView
//
// That container sits *below* everything a screen can reach. `contentStyle:
// 'transparent'` only clears the layer above it, so making the screens
// transparent revealed iOS's grouped-background grey rather than the
// <AppBackground> behind the tab navigator. Measured, not guessed: with this
// layout removed the tab showed the scene beneath it; with it, a flat
// rgb(242,242,242) whatever the screens did. Drawing a second background inside
// this layout does not help either — the stack's container paints on top of it.
//
// So the theme is the thing to change, and only for this stack. Everything else
// in it stays default.
const TRANSPARENT_STACK = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent' },
};

export default function ChatsLayout() {
  return (
    <ThemeProvider value={TRANSPARENT_STACK}>
      <Stack
        screenOptions={{
          headerShown: false,
          // The layer above the container — needed as well, or the screens
          // themselves paint over the background the theme just uncovered.
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="index" />
        {/* This stack holds the list plus *one* open thread, and that is
            enforced here rather than cleaned up afterwards.

            Every "open chat" button in the app calls `router.push` — the map's
            dealt card, the home rows, a notification, search, the profile
            sheet. expo-router resolves that push against the current state and
            finds the deepest navigator where the two diverge: `[eventId]`
            matches this stack's current route by *name* but not by param, so
            the divergence lands here and the action stays a PUSH. Open five
            chats and the stack is five deep, and back walks down it one thread
            at a time — which is the bug this fixes.

            `dangerouslySingular` gives the route a constant id, and
            `StackRouter` treats PUSH and NAVIGATE the same once a route with a
            matching id exists: it reuses that route with the new params and
            moves it to the top instead of adding a second one. So there is
            never a stale thread underneath, whichever way you leave — the
            header button, the iOS swipe, Android back. It also means opening
            the thread you are already in cannot mount a second copy of it,
            which is what used to collide on the realtime channel name.

            The screens remount themselves on a param change — a reused route
            keeps its key, so React would otherwise leave the previous thread's
            messages in state. See the wrapper at the bottom of each. */}
        <Stack.Screen
          name="[eventId]"
          dangerouslySingular={() => 'conversation'}
        />
        <Stack.Screen
          name="dm/[friendId]"
          dangerouslySingular={() => 'conversation'}
        />
      </Stack>
    </ThemeProvider>
  );
}
