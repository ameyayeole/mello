import { Stack } from 'expo-router';

// Anchor the chats list as the stack's initial route. Without this, deep-pushing
// into `chats/[eventId]` from outside the tabs (e.g. the event host screen) mounts
// the chat with no `index` beneath it — so back falls through to the Home tab and
// the Inbox tab gets stuck on that chat with no way back to the list.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function ChatsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
